from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.core.config import MAX_STEPS_PER_RUN
from app.services.llm import LlmError, LlmMessage, LlmProvider
from app.services.tools import TOOL_SPECS

logger = logging.getLogger(__name__)


class PlannerError(RuntimeError):
    """The planner could not produce a usable plan."""


@dataclass(slots=True)
class AgentSpec:
    """Decoupled view of an agent definition so planning logic stays DB-free."""

    id: str | None
    name: str
    description: str = ""
    system_prompt: str = ""
    tools: list[str] = field(default_factory=list)

    @classmethod
    def from_model(cls, model) -> AgentSpec:
        return cls(
            id=model.id,
            name=model.name,
            description=model.description or "",
            system_prompt=model.system_prompt or "",
            tools=list(model.tools or []),
        )


@dataclass(slots=True)
class PlannedStep:
    index: int
    title: str
    instruction: str
    agent_name: str
    agent_id: str | None = None


@dataclass(slots=True)
class Plan:
    summary: str
    steps: list[PlannedStep]
    tokens: int = 0


PLANNER_SYSTEM_PROMPT = """You are the planning agent in a multi-agent orchestration \
platform. You break a high-level goal into an ordered list of subtasks and assign each \
subtask to exactly one sub-agent.

IMPORTANT: Do NOT use native function calling or tool_use. Respond with plain text/JSON only.

Rules:
- Produce between 1 and {max_steps} subtasks. Fewer, meatier steps beat many trivial ones.
- Steps run sequentially; later steps may rely on earlier outputs.
- Assign each subtask to one of the listed sub-agents by its exact name. Match the work to \
the agent's tools: research needs web_search, quantitative work needs run_code.
- Never invent an agent name and never invent tools.
- The final step must synthesize the prior steps into a comprehensive final deliverable that fully answers the user's OVERALL GOAL.

Respond with JSON only, in exactly this shape:
{{
  "summary": "<one sentence on how you decomposed the goal>",
  "steps": [
    {{"title": "<imperative subtask title>",
      "instruction": "<what the sub-agent must do, self-contained>",
      "agent": "<exact agent name>"}}
  ]
}}"""


def render_agent_roster(agents: list[AgentSpec]) -> str:
    """Machine-parseable roster; the mock provider reads this same format."""
    if not agents:
        return "- (none available)"
    lines = []
    for agent in agents:
        tools = ", ".join(agent.tools) if agent.tools else "none"
        description = " ".join((agent.description or "general purpose").split())
        lines.append(f"- name: {agent.name} | tools: {tools} | description: {description}")
    return "\n".join(lines)


def build_planner_prompt(goal: str, agents: list[AgentSpec]) -> tuple[str, str]:
    system = PLANNER_SYSTEM_PROMPT.format(max_steps=MAX_STEPS_PER_RUN)
    tool_catalogue = "\n".join(
        f"- {name}: {spec['description']}" for name, spec in TOOL_SPECS.items()
    )
    user = (
        f"GOAL: {goal.strip()}\n\n"
        f"AVAILABLE_AGENTS:\n{render_agent_roster(agents)}\n\n"
        f"TOOL_CATALOGUE:\n{tool_catalogue}\n\n"
        f"MAX_STEPS: {MAX_STEPS_PER_RUN}"
    )
    return system, user


def _match_agent(name: str, agents: list[AgentSpec]) -> AgentSpec | None:
    """Resolve a model-supplied agent name, tolerating case and near-misses."""
    if not agents:
        return None
    candidate = (name or "").strip().lower()
    if not candidate:
        return None

    for agent in agents:
        if agent.name.lower() == candidate:
            return agent

    normalise = lambda value: value.replace("-", " ").replace("_", " ").strip()  # noqa: E731
    target = normalise(candidate)
    for agent in agents:
        if normalise(agent.name.lower()) == target:
            return agent
    for agent in agents:
        agent_name = agent.name.lower()
        if agent_name in candidate or candidate in agent_name:
            return agent
    return None


def _fallback_agent(title: str, instruction: str, agents: list[AgentSpec]) -> AgentSpec | None:
    """Pick the agent whose tools best fit the step when assignment is missing."""
    if not agents:
        return None
    text = f"{title} {instruction}".lower()
    wants_search = any(word in text for word in ("search", "research", "find", "source", "look up"))
    wants_code = any(
        word in text for word in ("code", "compute", "calculate", "script", "benchmark", "verify")
    )

    if wants_search:
        for agent in agents:
            if "web_search" in agent.tools:
                return agent
    if wants_code:
        for agent in agents:
            if "run_code" in agent.tools:
                return agent
    return agents[0]


def normalize_plan(raw: dict, agents: list[AgentSpec], goal: str) -> Plan:
    """Turn a raw model plan into validated, executable steps.

    Model output is untrusted: it can hold too many steps, unknown agent names,
    blank titles, or the wrong container type. Everything is coerced here so the
    orchestrator only ever sees a well-formed plan.
    """
    if not isinstance(raw, dict):
        raise PlannerError("planner response was not a JSON object")

    raw_steps = raw.get("steps")
    if isinstance(raw_steps, dict):
        raw_steps = [raw_steps]
    if not isinstance(raw_steps, list) or not raw_steps:
        raise PlannerError("planner response contained no steps")

    steps: list[PlannedStep] = []
    for entry in raw_steps:
        if len(steps) >= MAX_STEPS_PER_RUN:
            logger.info("planner returned more than %s steps; truncating", MAX_STEPS_PER_RUN)
            break
        if isinstance(entry, str):
            entry = {"title": entry}
        if not isinstance(entry, dict):
            continue

        title = " ".join(str(entry.get("title") or entry.get("task") or "").split())
        instruction = str(entry.get("instruction") or entry.get("description") or "").strip()
        if not title and instruction:
            title = " ".join(instruction.split())[:120]
        if not title:
            continue

        requested = str(entry.get("agent") or entry.get("agent_name") or "")
        agent = _match_agent(requested, agents) or _fallback_agent(title, instruction, agents)
        if requested and agent and agent.name.lower() != requested.strip().lower():
            logger.info("planner requested unknown agent '%s'; routed to '%s'", requested, agent.name)

        steps.append(
            PlannedStep(
                index=len(steps),
                title=title[:300],
                instruction=instruction or f"{title}\n\nOverall goal: {goal.strip()}",
                agent_name=agent.name if agent else "unassigned",
                agent_id=agent.id if agent else None,
            )
        )

    if not steps:
        raise PlannerError("planner produced no usable steps")

    summary = " ".join(str(raw.get("summary") or "").split())
    if not summary:
        summary = f"Decomposed the goal into {len(steps)} sequential subtasks."

    return Plan(summary=summary, steps=steps)


def create_plan(goal: str, agents: list[AgentSpec], provider: LlmProvider) -> Plan:
    system, user = build_planner_prompt(goal, agents)
    try:
        raw, response = provider.complete_json(
            system=system, messages=[LlmMessage(role="user", content=user)], intent="plan"
        )
    except LlmError as exc:
        raise PlannerError(f"planning call failed: {exc}") from exc

    plan = normalize_plan(raw, agents, goal)
    plan.tokens = response.tokens
    return plan
