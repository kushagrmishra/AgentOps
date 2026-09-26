from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.config import MAX_TOOL_CALLS_PER_STEP
from app.services.llm import LlmError, LlmMessage, LlmProvider, extract_json_object
from app.services.planner import AgentSpec
from app.services.tools import ToolOutcome, execute_tool, tool_prompt_block

logger = logging.getLogger(__name__)

AGENT_SYSTEM_PROMPT = """You are "{name}", an expert sub-agent in a multi-agent orchestration \
platform. {description}

Today's date is {current_date} (Year {current_year}).

{extra_instructions}

Available tools:
{tools}

Rules for high token efficiency & top-tier output:
- Be direct, dense, and executive-level. Use structured Markdown (bullet points, clear tables, direct data).
- When gathering data or web searching for recent, latest, or current information, use the current year ({current_year}) and never hardcode past years (such as 2023 or 2024) unless the user explicitly requested that specific past year.
- When authoring reports or deliverables (via `write_file`), ALWAYS read everything provided by previous analyst and researcher steps. Make and save the complete deliverable as a structured Markdown file (.md) in the workspace with all findings, comparison tables, and recommendations, NEVER as `.txt`.
- Eliminate conversational filler, pleasantries, or preamble ("Sure, I can help..."). Deliver high-signal content directly.
- Never call unlisted tools. Max {max_calls} tool calls allowed.
- IMPORTANT: All tool calls must be JSON in your response text (no native function calling).

Response formats (JSON only):
1. To call tools:
{{"thought": "<concise reason>", "tool_calls": [{{"tool": "<name>", "arguments": {{}}}}]}}

2. To finish (or when no tools are needed):
{{"output": "<complete high-density answer, analysis, or deliverable for this subtask>"}}"""


def _extract_agent_output(payload: dict[str, Any], raw_text: str) -> str | None:
    """Extract substantive step output across various LLM response conventions."""
    # 1. Primary candidate keys
    for key in (
        "output",
        "answer",
        "result",
        "response",
        "content",
        "analysis",
        "summary",
        "findings",
        "text",
        "message",
        "recommendation",
        "report",
        "conclusion",
        "solution",
        "deliverable",
        "trade_offs",
        "tradeoffs",
    ):
        val = payload.get(key)
        if val is not None:
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, (dict, list)):
                return json.dumps(val, indent=2)
            if isinstance(val, (int, float, bool)):
                return str(val)

    # 2. Check for any substantive data keys excluding metadata
    data_items = {
        k: v
        for k, v in payload.items()
        if k not in ("thought", "thinking", "tool_calls", "tools", "call") and v is not None
    }
    if data_items:
        if len(data_items) == 1:
            val = next(iter(data_items.values()))
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, (dict, list)):
                return json.dumps(val, indent=2)
            return str(val)
        return json.dumps(data_items, indent=2)

    return None


class AgentRunError(RuntimeError):
    """The sub-agent could not complete its step."""


@dataclass(slots=True)
class AgentStepResult:
    output: str
    tokens: int = 0
    tool_outcomes: list[ToolOutcome] = field(default_factory=list)


def build_agent_prompt(
    *,
    goal: str,
    step_title: str,
    instruction: str,
    prior_outputs: list[tuple[str, str]],
    tools: list[str],
    is_final_step: bool = False,
    agent_name: str = "",
    dependencies: list[int] | None = None,
) -> str:
    """Compose the sub-agent's task prompt.

    Labelled blocks are load-bearing: the mock provider parses them, so keep the
    `LABEL:` shape when editing.
    """
    now = datetime.now(UTC)
    current_date = now.strftime("%Y-%m-%d")
    current_year = str(now.year)
    sections = [
        f"CURRENT_DATE: {current_date} (Year {current_year})",
        f"OVERALL_GOAL: {goal.strip()}",
        f"STEP: {step_title.strip()}",
    ]
    if instruction.strip():
        sections.append(f"INSTRUCTION: {instruction.strip()}")
    sections.append(f"TOOLS: {', '.join(tools) if tools else 'none'}")

    is_writer = (agent_name.lower() == "writer") or ("write" in step_title.lower()) or is_final_step
    if is_writer and prior_outputs:
        sections.append(
            "FINAL_SYNTHESIS: This is the deliverable authoring step. Your output will serve as the complete final deliverable for the OVERALL_GOAL. You MUST thoroughly review and incorporate all findings, facts, arithmetic, metric comparisons, and tables from the analyst and prior sub-agents in PRIOR_STEP_OUTPUTS. You have full permission to use all available processes and tools. Based on that complete research and analysis, make and save the comprehensive final deliverable file in the workspace using the `write_file` tool as a structured Markdown (.md) file (e.g. matching the goal topic or report title), ending with concrete recommendations."
        )
    elif is_final_step and prior_outputs:
        sections.append(
            "FINAL_SYNTHESIS: This is the final step of the pipeline. Your output will serve as the complete final deliverable for the OVERALL_GOAL. Incorporate all findings, facts, and conclusions from the PRIOR_STEP_OUTPUTS so the final answer is complete and fully answers the OVERALL_GOAL."
        )

    if prior_outputs:
        filtered: list[tuple[int, str, str]] = []
        for position, (title, output) in enumerate(prior_outputs):
            if dependencies is not None and len(dependencies) > 0 and not is_final_step:
                if position not in dependencies:
                    continue
            filtered.append((position + 1, title, output))

        if filtered:
            context = "\n\n".join(
                f"[step {pos}: {title}]\n{output.strip()[:1500]}"
                for pos, title, output in filtered
            )
            sections.append(f"PRIOR_STEP_OUTPUTS:\n{context}")

    return "\n\n".join(sections)


def run_step(
    *,
    agent: AgentSpec | None,
    goal: str,
    step_title: str,
    instruction: str,
    prior_outputs: list[tuple[str, str]],
    provider: LlmProvider,
    on_tool_call: Callable[[ToolOutcome], None] | None = None,
    is_final_step: bool = False,
    dependencies: list[int] | None = None,
) -> AgentStepResult:
    """Run one subtask: model turn, optional tool calls, then a final answer."""
    name = agent.name if agent else "generalist"
    allowed_tools = list(agent.tools) if agent else []

    now = datetime.now(UTC)
    current_date = now.strftime("%Y-%m-%d")
    current_year = str(now.year)

    system = AGENT_SYSTEM_PROMPT.format(
        name=name,
        description=(agent.description if agent and agent.description else "You complete one subtask."),
        current_date=current_date,
        current_year=current_year,
        extra_instructions=(agent.system_prompt.strip() if agent and agent.system_prompt else ""),
        tools=tool_prompt_block(allowed_tools),
        max_calls=MAX_TOOL_CALLS_PER_STEP,
    )

    messages = [
        LlmMessage(
            role="user",
            content=build_agent_prompt(
                goal=goal,
                step_title=step_title,
                instruction=instruction,
                prior_outputs=prior_outputs,
                tools=allowed_tools,
                is_final_step=is_final_step,
                agent_name=name,
                dependencies=dependencies,
            ),
        )
    ]

    outcomes: list[ToolOutcome] = []
    total_tokens = 0

    # One extra turn so the agent can answer after exhausting its tool budget.
    for turn in range(MAX_TOOL_CALLS_PER_STEP + 1):
        try:
            response = provider.complete(system=system, messages=messages, intent="agent")
        except LlmError as exc:
            raise AgentRunError(f"sub-agent '{name}' model call failed: {exc}") from exc

        total_tokens += response.tokens

        try:
            payload = extract_json_object(response.text)
        except LlmError:
            # Non-JSON output is still a usable answer; take it and stop.
            text = response.text.strip()
            if not text:
                raise AgentRunError(f"sub-agent '{name}' returned an empty response") from None
            return AgentStepResult(output=text, tokens=total_tokens, tool_outcomes=outcomes)

        output = _extract_agent_output(payload, response.text)
        requested_calls = payload.get("tool_calls") or []
        if isinstance(requested_calls, dict):
            requested_calls = [requested_calls]

        if output and not requested_calls:
            return AgentStepResult(
                output=output, tokens=total_tokens, tool_outcomes=outcomes
            )

        if not requested_calls:
            # If the model returned neither tools nor recognized output:
            # Prompt the model to provide an output rather than failing immediately.
            if turn < MAX_TOOL_CALLS_PER_STEP:
                logger.info(
                    "sub-agent '%s' returned neither output nor tool calls on turn %d; prompting for output",
                    name,
                    turn,
                )
                messages.append(LlmMessage(role="assistant", content=response.text))
                messages.append(
                    LlmMessage(
                        role="user",
                        content=(
                            'You did not provide an "output" or request any "tool_calls". '
                            'Please reply now with {"output": "<your complete answer>"} only.'
                        ),
                    )
                )
                continue

            # On the final turn, check if a substantive thought or text can be salvaged
            thought = payload.get("thought") or payload.get("thinking")
            if (
                thought
                and isinstance(thought, str)
                and len(thought.strip()) > 30
                and "thinking about it" not in thought.lower()
            ):
                return AgentStepResult(
                    output=thought.strip(), tokens=total_tokens, tool_outcomes=outcomes
                )

            raise AgentRunError(
                f"sub-agent '{name}' returned neither an output nor a tool call"
            )

        if len(outcomes) >= MAX_TOOL_CALLS_PER_STEP:
            logger.info("tool budget exhausted for step '%s'; forcing a final answer", step_title)
            messages.append(LlmMessage(role="assistant", content=response.text))
            messages.append(
                LlmMessage(
                    role="user",
                    content=(
                        "TOOL_BUDGET_EXHAUSTED: no further tool calls are permitted. "
                        'Reply now with {"output": "..."} only.'
                    ),
                )
            )
            continue

        budget = MAX_TOOL_CALLS_PER_STEP - len(outcomes)
        results: list[str] = []
        for call in requested_calls[:budget]:
            if not isinstance(call, dict):
                continue
            tool_name = str(call.get("tool") or call.get("name") or "")
            arguments = call.get("arguments") or call.get("input") or {}
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments)
                except json.JSONDecodeError:
                    arguments = {"input": arguments}

            outcome = execute_tool(tool_name, arguments, allowed_tools)
            outcomes.append(outcome)
            if on_tool_call:
                on_tool_call(outcome)
            res_str = outcome.result
            if len(res_str) > 1200:
                res_str = res_str[:1000] + f"\n[... {len(res_str) - 1000} chars truncated for token efficiency ...]"
            results.append(
                f"TOOL_RESULT[{outcome.tool_name}] status={outcome.status}\n{res_str}"
            )

        if not results:
            raise AgentRunError(f"sub-agent '{name}' requested malformed tool calls")

        # Multi-turn tool output compaction: keep the newest result full, but compact earlier turns
        if len(messages) > 2:
            for idx in range(1, len(messages) - 1):
                if messages[idx].role == "user" and "TOOL_RESULT" in messages[idx].content:
                    lines = messages[idx].content.split("\n")
                    if len(lines) > 3 and "[Compacted]" not in messages[idx].content:
                        messages[idx].content = lines[0] + "\n[Compacted prior turn tool result: completed ok]"

        messages.append(LlmMessage(role="assistant", content=response.text))
        messages.append(
            LlmMessage(
                role="user",
                content="\n\n".join(results)
                + '\n\nContinue. Reply with {"output": "..."} when the subtask is complete.',
            )
        )

    raise AgentRunError(f"sub-agent '{name}' did not finish within its turn budget")
