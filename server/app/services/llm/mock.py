from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass

from app.core.config import MAX_STEPS_PER_RUN, settings
from app.services.llm.base import Intent, LlmMessage, LlmProvider, LlmResponse
from app.services.rubric import score_against_expectation
from app.services.text_match import keywords

# Keyword families used to route a goal to a plausible sequence of subtasks.
_RESEARCH_HINTS = {
    "research", "find", "search", "investigate", "compare", "latest", "news",
    "sources", "competitor", "competitors", "market", "survey", "review", "landscape",
    "documentation", "docs", "who", "what", "trends",
}
_COMPUTE_HINTS = {
    "calculate", "compute", "code", "script", "benchmark", "simulate", "data",
    "analyze", "analysis", "numbers", "metrics", "cost", "estimate", "model",
    "throughput", "latency", "performance", "sql", "query", "parse",
}
_WRITE_HINTS = {
    "summarize", "summary", "write", "report", "draft", "document", "brief",
    "explain", "memo", "recommend", "recommendation", "propose", "plan",
    "outline", "checklist", "post",
}

_TOOL_FOR_KIND = {"research": "web_search", "compute": "run_code", "write": None}


@dataclass(slots=True)
class _PlannerContext:
    goal: str
    agents: list[dict]


def _parse_labelled_block(text: str, label: str) -> str:
    """Read a `LABEL:` value out of a structured prompt block."""
    match = re.search(rf"^{re.escape(label)}:\s*(.*?)(?=\n[A-Z_]+:|\Z)", text, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else ""


def _parse_agents(text: str) -> list[dict]:
    """Parse the `- name: x | tools: a,b | description: ...` agent roster."""
    agents: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("- name:"):
            continue
        parts = [part.strip() for part in line.lstrip("- ").split("|")]
        entry: dict = {"name": "", "tools": [], "description": ""}
        for part in parts:
            if ":" not in part:
                continue
            key, _, value = part.partition(":")
            key = key.strip().lower()
            value = value.strip()
            if key == "tools":
                entry["tools"] = [
                    tool.strip() for tool in value.split(",") if tool.strip() and tool != "none"
                ]
            elif key in {"name", "description"}:
                entry[key] = value
        if entry["name"]:
            agents.append(entry)
    return agents


def _short_goal(goal: str, limit: int = 90) -> str:
    condensed = " ".join(goal.split())
    return condensed if len(condensed) <= limit else condensed[: limit - 1].rstrip() + "…"


def _stable_int(text: str) -> int:
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16)


_TOOL_RESULT_RE = re.compile(
    r"^TOOL_RESULT\[([a-z_]+)\] status=(\w+)\n(.*?)(?=^TOOL_RESULT\[|\Z)",
    re.MULTILINE | re.DOTALL,
)
_CONTINUE_RE = re.compile(r"\n+Continue\. Reply with.*\Z", re.DOTALL)
_SYSTEM_NAME_RE = re.compile(r'^You are "([^"]+)"')
_URL_RE = re.compile(r"https://\S+")
_METRIC_RE = re.compile(r"(\d+)% improvement")
_STDOUT_RE = re.compile(r"^(?:result: )?([-+]?\d[\d.]*)$", re.MULTILINE)
_ASSIGNMENT_RE = re.compile(r"^\s*([a-z_][a-z0-9_]*)\s*=\s*([^\n#]+)", re.MULTILINE)
_PRIOR_STEP_RE = re.compile(r"^\[step (\d+): (.+?)\]$", re.MULTILINE)
_COMPUTED_TOTAL_RE = re.compile(r"computed total: ([-+]?[\d.]+)")
_BREVITY_RE = re.compile(
    r"\b(one|single|a)\s+(paragraph|sentence)\b|\bin\s+\d+\s+(words|sentences)\b"
    r"|\b(briefly|concisely|tl;dr)\b|\b(short|brief|concise)\s+(summary|answer|brief|note)\b",
    re.IGNORECASE,
)
_QUANTITY_RE = re.compile(
    r"(\d[\d,]*(?:\.\d+)?)\s*(million|billion|thousand|[kmb])?\s+([a-z][a-z-]{2,})",
    re.IGNORECASE,
)
_LEADING_VERB_RE = re.compile(
    r"^(?:please\s+)?(?:research|find|calculate|compute|summars?ize|summarise|write|draft|"
    r"analyse|analyze|compare|investigate|explain|propose|outline|review|estimate|build)\s+",
    re.IGNORECASE,
)
_SCALES = {"thousand": 1_000, "k": 1_000, "million": 1_000_000, "m": 1_000_000,
           "billion": 1_000_000_000, "b": 1_000_000_000}


@dataclass(slots=True)
class _ToolResult:
    tool: str
    status: str
    body: str


def _tool_results(messages: list[LlmMessage]) -> list[_ToolResult]:
    """Tool results fed back during this step, in call order.

    Skips the first message: that is the task prompt, whose PRIOR_STEP_OUTPUTS
    block can quote text from earlier steps.
    """
    results: list[_ToolResult] = []
    for message in messages[1:]:
        if message.role != "user":
            continue
        for tool, status, body in _TOOL_RESULT_RE.findall(message.content):
            results.append(_ToolResult(tool, status, _CONTINUE_RE.sub("", body).strip()))
    return results


def _carried_computation(prior: str) -> list[str]:
    """The arithmetic, total, and assumptions stated by an earlier step."""
    lines: list[str] = []
    for line in prior.splitlines():
        stripped = line.strip()
        if (
            _ASSIGNMENT_RE.match(stripped)
            or stripped.startswith(("=>", "Assumption:"))
        ):
            lines.append(stripped)
    return list(dict.fromkeys(lines))[:6]


def _wants_brevity(goal: str) -> bool:
    """Whether the goal itself caps the length of the answer."""
    return bool(_BREVITY_RE.search(goal))


def _topic(goal: str) -> str:
    """The goal with its leading imperative removed, for use inside a sentence."""
    topic = _LEADING_VERB_RE.sub("", " ".join(goal.split())).rstrip(" .")
    return _short_goal(topic, 140) if topic else "the stated goal"


def _quantity(text: str) -> tuple[str, float] | None:
    """First `<number> <unit> <noun>` in the text, as (noun, value)."""
    for raw, scale, noun in _QUANTITY_RE.findall(text):
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        value *= _SCALES.get(scale.lower(), 1) if scale else 1
        label = re.sub(r"[^a-z0-9]+", "_", noun.lower()).strip("_")
        if label and value > 0:
            return label, value
    return None


class MockProvider(LlmProvider):
    """Deterministic stand-in for a hosted model.

    Same goal in, same plan out — which keeps the eval harness reproducible and
    lets the whole pipeline run with no API key configured.
    """

    name = "mock"

    def __init__(
        self,
        model: str = "mock-planner-v1",
        max_tokens: int = 2048,
        latency_ms: int | None = None,
    ) -> None:
        super().__init__(model=model, max_tokens=max_tokens)
        self.latency_ms = settings.mock_latency_ms if latency_ms is None else latency_ms

    def complete(
        self,
        *,
        system: str,
        messages: list[LlmMessage],
        intent: Intent = "generic",
        max_tokens: int | None = None,
        temperature: float = 0.2,
    ) -> LlmResponse:
        if self.latency_ms > 0:
            # Runs execute on worker threads, so this paces the pipeline without
            # blocking any request handler.
            time.sleep(self.latency_ms / 1000)

        prompt = messages[-1].content if messages else ""
        transcript = "\n".join(f"{message.role}: {message.content}" for message in messages)

        if intent == "plan":
            text = self._plan(prompt)
        elif intent == "agent":
            text = self._agent_turn(system, messages)
        elif intent == "judge":
            text = self._judge(prompt)
        else:
            text = json.dumps({"output": f"[mock] {_short_goal(prompt, 200)}"})

        approx_tokens = max(1, (len(system) + len(transcript) + len(text)) // 4)
        return LlmResponse(
            text=text,
            provider=self.name,
            model=self.model,
            tokens=approx_tokens,
            meta={"intent": intent, "simulated": True},
        )

    # ---------------------------------------------------------------- planning

    def _plan(self, prompt: str) -> str:
        goal = _parse_labelled_block(prompt, "GOAL") or prompt.strip()
        agents = _parse_agents(prompt)
        context = _PlannerContext(goal=goal, agents=agents)

        kinds = self._infer_kinds(goal)
        steps = []
        for position, kind in enumerate(kinds, start=1):
            agent = self._pick_agent(context, kind)
            steps.append(
                {
                    "title": self._step_title(kind, goal, position),
                    "instruction": self._step_instruction(kind, goal),
                    "agent": agent["name"] if agent else "",
                }
            )

        return json.dumps(
            {
                "summary": (
                    f"Decomposed the goal into {len(steps)} sequential subtasks, "
                    f"routing each to the sub-agent whose tools fit the work."
                ),
                "steps": steps,
            },
            indent=2,
        )

    def _infer_kinds(self, goal: str) -> list[str]:
        goal_keys = keywords(goal)
        kinds: list[str] = []

        if goal_keys & _RESEARCH_HINTS or not goal_keys:
            kinds.append("research")
        if goal_keys & _COMPUTE_HINTS:
            kinds.append("compute")
        if goal_keys & _WRITE_HINTS or len(kinds) < 2:
            kinds.append("write")

        if len(kinds) < 2:
            # Every goal deserves at least a gather-then-report shape.
            kinds = ["research", *kinds] if "research" not in kinds else [*kinds, "write"]

        # Longer goals get an extra verification pass, chosen deterministically.
        if len(goal.split()) > 25 and _stable_int(goal) % 2 == 0:
            kinds.insert(len(kinds) - 1, "compute")

        deduped: list[str] = []
        for kind in kinds:
            if kind not in deduped or kind == "compute":
                deduped.append(kind)
        return deduped[:MAX_STEPS_PER_RUN]

    def _pick_agent(self, context: _PlannerContext, kind: str) -> dict | None:
        if not context.agents:
            return None
        preferred_tool = _TOOL_FOR_KIND.get(kind)
        if preferred_tool:
            for agent in context.agents:
                if preferred_tool in agent["tools"]:
                    return agent
        if kind == "write":
            for agent in context.agents:
                if not agent["tools"]:
                    return agent
        return context.agents[_stable_int(context.goal + kind) % len(context.agents)]

    def _step_title(self, kind: str, goal: str, position: int) -> str:
        short = _short_goal(goal, 70)
        titles = {
            "research": f"Gather background and sources for: {short}",
            "compute": f"Run analysis to support: {short}",
            "write": f"Produce the final deliverable for: {short}",
        }
        return titles.get(kind, f"Step {position}: {short}")

    def _step_instruction(self, kind: str, goal: str) -> str:
        instructions = {
            "research": (
                "Search for authoritative, current sources relevant to the goal. "
                "Return the key findings with the URL for each claim."
            ),
            "compute": (
                "Use code execution to verify or quantify the findings from the "
                "previous step. Show the computation and its result."
            ),
            "write": (
                "Synthesise the previous steps into the deliverable the goal asks "
                "for. Be concrete and cite which step each claim came from."
            ),
        }
        return f"{instructions.get(kind, 'Complete the subtask.')}\n\nOverall goal: {goal}"

    # ------------------------------------------------------------- agent turns

    def _agent_turn(self, system: str, messages: list[LlmMessage]) -> str:
        # Always parse the task from the first user message: later turns carry tool
        # results, and PRIOR_STEP_OUTPUTS can quote text from earlier steps.
        task = next((message.content for message in messages if message.role == "user"), "")
        goal = _parse_labelled_block(task, "OVERALL_GOAL")
        step_title = _parse_labelled_block(task, "STEP") or _short_goal(task, 70)
        tools_line = _parse_labelled_block(task, "TOOLS")
        available = [tool.strip() for tool in tools_line.split(",") if tool.strip() and tool != "none"]
        # An assistant message exists only after this step already made a tool call,
        # so it is a reliable signal that prior-step text cannot forge.
        already_called = any(message.role == "assistant" for message in messages)

        if available and not already_called:
            tool = available[0]
            return json.dumps(
                {
                    "thought": f"I need {tool} to make progress on this subtask.",
                    "tool_calls": [
                        {"tool": tool, "arguments": self._tool_args(tool, goal or step_title)}
                    ],
                },
                indent=2,
            )

        return json.dumps({"output": self._synthesise(system, task, messages)}, indent=2)

    def _tool_args(self, tool: str, subject: str) -> dict:
        if tool == "web_search":
            return {"query": _short_goal(subject, 80), "limit": 3}
        if tool == "run_code":
            return {"language": "python", "code": self._computation(subject)}
        if tool == "read_file":
            return {"path": "README.md"}
        return {"input": _short_goal(subject, 60)}

    def _computation(self, subject: str) -> str:
        """Build a python snippet grounded in a quantity from the goal.

        The arithmetic sandbox in `tools.run_code` evaluates this for real, so the
        number the agent reports downstream is actually computed rather than faked.
        """
        quantity = _quantity(subject)
        if quantity is None:
            return (
                "# no explicit quantity in the goal; profile a sample of observed values\n"
                "samples = [12, 18, 24, 31, 44]\n"
                "print(sum(samples) / len(samples))"
            )
        label, value = quantity
        amount = int(value) if float(value).is_integer() else value
        return (
            f"{label} = {amount}\n"
            "unit_cost_per_1k = 2.00  # assumption: ~$0.002 per request on a small model\n"
            f"monthly_total = {label} / 1000 * unit_cost_per_1k\n"
            "print(monthly_total)"
        )

    @staticmethod
    def _requested_code(messages: list[LlmMessage]) -> str:
        """The code this step asked `run_code` to execute.

        The tool result echoes only a byte count, so the snippet itself has to come
        back out of the assistant turn that requested it.
        """
        for message in messages:
            if message.role != "assistant":
                continue
            try:
                payload = json.loads(message.content)
            except json.JSONDecodeError:
                continue
            for call in payload.get("tool_calls") or []:
                if isinstance(call, dict) and call.get("tool") == "run_code":
                    return str((call.get("arguments") or {}).get("code") or "")
        return ""

    def _synthesise(self, system: str, task: str, messages: list[LlmMessage]) -> str:
        """Write the step's final answer from its tool results and prior steps.

        Mirrors what a real sub-agent does with this prompt: attribute claims to the
        source that produced them, show the arithmetic, and name the assumptions.
        """
        role = match.group(1) if (match := _SYSTEM_NAME_RE.search(system)) else "generalist"
        goal = _parse_labelled_block(task, "OVERALL_GOAL")
        step_title = _parse_labelled_block(task, "STEP") or _short_goal(task, 70)
        prior = _parse_labelled_block(task, "PRIOR_STEP_OUTPUTS")
        results = _tool_results(messages)

        # A writer sub-agent has no tools, so its evidence is the earlier steps' text.
        evidence_text = "\n".join(result.body for result in results) or prior
        citations = _URL_RE.findall(evidence_text)[:4]
        metrics = _METRIC_RE.findall(evidence_text)

        sections = [f"{step_title}", ""]
        if goal:
            sections += [f"Toward the goal: {_topic(goal)}.", ""]

        if citations:
            sections.append("Sources reviewed:")
            for index, url in enumerate(citations):
                metric = (
                    f"reports a {metrics[index]}% improvement on its primary metric"
                    if index < len(metrics)
                    else "provides supporting background"
                )
                sections.append(f"  [{index + 1}] {url} — {metric}")
            if len(citations) >= 2 and len(metrics) >= 2:
                leader = 1 if int(metrics[0]) >= int(metrics[1]) else 2
                sections.append(
                    f"  Comparison: source [1] at {metrics[0]}% vs source [2] at {metrics[1]}% — "
                    f"option {leader} leads on the reported metric, but the two differ in "
                    f"what they optimise for, so the trade-off is not settled by that number alone."
                )
            sections.append("")

        for result in results:
            if result.status != "ok":
                sections += [
                    f"Gap: {result.tool} returned status={result.status}; "
                    f"continuing without it and flagging the missing evidence.",
                    "",
                ]
                continue
            if result.tool == "run_code":
                stdout = _STDOUT_RE.findall(result.body)
                sections.append("Computation (arithmetic evaluated by run_code):")
                for name, expression in _ASSIGNMENT_RE.findall(self._requested_code(messages))[:4]:
                    sections.append(f"  {name} = {expression.strip()}")
                if stdout:
                    sections.append(f"  => computed total: {stdout[-1]}")
                sections += [
                    "  Assumption: the unit cost above is a placeholder; substitute your "
                    "provider's published rate to firm up the total.",
                    "",
                ]
            elif result.tool == "read_file":
                first_line = next(
                    (line for line in result.body.splitlines() if line and not line.startswith("---")),
                    "",
                )
                sections += [f"Read from file: {_short_goal(first_line, 100)}", ""]

        if prior:
            inputs = [
                f"step {position}: {title}"
                for position, title in _PRIOR_STEP_RE.findall(prior)
            ]
            if inputs:
                sections.append(
                    "Inputs from earlier steps: " + "; ".join(dict.fromkeys(inputs)) + "."
                )
                sections.append("")
            # Carry the arithmetic itself, not just its answer: the deliverable has
            # to stand on its own, and the reader needs to see where a figure came
            # from and what was assumed to get it.
            carried = _carried_computation(prior)
            if carried and not any(result.tool == "run_code" for result in results):
                sections.append("Computation carried forward:")
                sections += [f"  {line}" for line in carried]
                sections.append("")

        recommendation = (
            f"Recommendation: proceed on {_topic(goal)} using the option backed by source [1]"
            if citations
            else f"Recommendation: proceed on {_topic(goal) if goal else 'this subtask'} as scoped above"
        )
        conclusion = (
            f"{recommendation}; re-check once real provider output replaces these "
            f"simulated results."
        )
        provenance = (
            f"-- {role} (mock provider: tool output is deterministic and simulated; "
            f"add an Anthropic API key in Settings for live model reasoning)"
        )

        if not results:
            # A tool-less agent is the deliverable writer. If the goal capped the
            # length, honour that instead of emitting the sectioned report.
            if _wants_brevity(goal):
                return self._brief(goal, citations, prior, provenance)
            # Otherwise lead with the conclusion, as its system prompt asks, then
            # show what it was built from.
            sections.insert(2 if goal else 1, conclusion)
            sections.insert(3 if goal else 2, "")
            return "\n".join([*sections, provenance]).strip()

        return "\n".join([*sections, conclusion, "", provenance]).strip()

    @staticmethod
    def _brief(goal: str, citations: list[str], prior: str, provenance: str) -> str:
        """A one-paragraph deliverable, for goals that ask for one."""
        totals = _COMPUTED_TOTAL_RE.findall(prior)
        evidence = []
        if citations:
            evidence.append(f"{len(citations)} cited sources ({citations[0]} and others)")
        if totals:
            evidence.append(f"a computed figure of {totals[-1]}")
        basis = " and ".join(evidence) if evidence else "the earlier steps in this run"

        return (
            f"{_topic(goal).capitalize()} — consolidated from {basis}. "
            f"Recommendation: treat this as directional only, since the tool results "
            f"and reasoning behind it are simulated.\n\n{provenance}"
        )

    # ------------------------------------------------------------------ judge

    def _judge(self, prompt: str) -> str:
        """Grade on the same rubric the no-judge fallback uses.

        The judge prompt says to weigh substance over wording, so scoring on word
        overlap alone would contradict it — a correct answer rarely echoes the
        expectation's phrasing.
        """
        expected = _parse_labelled_block(prompt, "EXPECTED_OUTCOME")
        actual = _parse_labelled_block(prompt, "ACTUAL_OUTPUT")
        rubric = score_against_expectation(actual, expected)
        return json.dumps({"score": rubric.score, "reasoning": rubric.summary}, indent=2)
