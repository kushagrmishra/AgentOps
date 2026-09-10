from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from app.core.config import MAX_TOOL_CALLS_PER_STEP
from app.services.llm import LlmError, LlmMessage, LlmProvider, extract_json_object
from app.services.planner import AgentSpec
from app.services.tools import ToolOutcome, execute_tool, tool_prompt_block

logger = logging.getLogger(__name__)

AGENT_SYSTEM_PROMPT = """You are "{name}", a sub-agent in a multi-agent orchestration \
platform. {description}

{extra_instructions}

You have access to exactly these tools:
{tools}

IMPORTANT: Do NOT use native function calling or tool_use APIs. All tool calls must be \
JSON in your response text as shown below.

Never call a tool that is not listed above. You may make at most {max_calls} tool calls \
for this subtask.

Respond with JSON only, using one of these two shapes.

To call tools:
{{"thought": "<why you need them>", "tool_calls": [{{"tool": "<name>", "arguments": {{}}}}]}}

To finish:
{{"output": "<your complete answer for this subtask>"}}"""


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
) -> str:
    """Compose the sub-agent's task prompt.

    Labelled blocks are load-bearing: the mock provider parses them, so keep the
    `LABEL:` shape when editing.
    """
    sections = [f"OVERALL_GOAL: {goal.strip()}", f"STEP: {step_title.strip()}"]
    if instruction.strip():
        sections.append(f"INSTRUCTION: {instruction.strip()}")
    sections.append(f"TOOLS: {', '.join(tools) if tools else 'none'}")

    if is_final_step and prior_outputs:
        sections.append(
            "FINAL_SYNTHESIS: This is the final step of the pipeline. Your output will serve as the complete final deliverable for the OVERALL_GOAL. Incorporate all findings, facts, and conclusions from the PRIOR_STEP_OUTPUTS so the final answer is complete and fully answers the OVERALL_GOAL."
        )

    if prior_outputs:
        context = "\n\n".join(
            f"[step {position}: {title}]\n{output.strip()[:1400]}"
            for position, (title, output) in enumerate(prior_outputs, start=1)
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
) -> AgentStepResult:
    """Run one subtask: model turn, optional tool calls, then a final answer."""
    name = agent.name if agent else "generalist"
    allowed_tools = list(agent.tools) if agent else []

    system = AGENT_SYSTEM_PROMPT.format(
        name=name,
        description=(agent.description if agent and agent.description else "You complete one subtask."),
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

        output = payload.get("output") or payload.get("answer")
        requested_calls = payload.get("tool_calls") or []
        if isinstance(requested_calls, dict):
            requested_calls = [requested_calls]

        if output and not requested_calls:
            return AgentStepResult(
                output=str(output).strip(), tokens=total_tokens, tool_outcomes=outcomes
            )

        if not requested_calls:
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
            results.append(
                f"TOOL_RESULT[{outcome.tool_name}] status={outcome.status}\n{outcome.result}"
            )

        if not results:
            raise AgentRunError(f"sub-agent '{name}' requested malformed tool calls")

        messages.append(LlmMessage(role="assistant", content=response.text))
        messages.append(
            LlmMessage(
                role="user",
                content="\n\n".join(results)
                + '\n\nContinue. Reply with {"output": "..."} when the subtask is complete.',
            )
        )

    raise AgentRunError(f"sub-agent '{name}' did not finish within its turn budget")
