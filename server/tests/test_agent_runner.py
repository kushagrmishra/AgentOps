"""Sub-agent execution: the tool-call loop, its allowlist and budget, and the
step output the mock provider synthesises from tool results.

The mock's output is what the eval harness grades and what the run detail view
renders, so it is worth asserting that it actually reflects the work done.
"""

from __future__ import annotations

import pytest

from app.core.config import MAX_TOOL_CALLS_PER_STEP
from app.services.agent_runner import AgentRunError, build_agent_prompt, run_step
from app.services.llm import LlmError, LlmProvider, LlmResponse, MockProvider
from app.services.planner import AgentSpec

RESEARCHER = AgentSpec(
    id="a1",
    name="researcher",
    description="Finds external information with citations.",
    system_prompt="Always attach the URL to each claim.",
    tools=["web_search"],
)
ANALYST = AgentSpec(
    id="a2",
    name="analyst",
    description="Quantifies findings by running code.",
    system_prompt="Show the computation behind every number.",
    tools=["run_code"],
)
WRITER = AgentSpec(
    id="a3",
    name="writer",
    description="Synthesises prior steps into the deliverable.",
    system_prompt="Lead with the conclusion.",
    tools=[],
)

COST_GOAL = "Calculate the monthly inference cost of serving 2 million requests."


def _run(agent: AgentSpec, goal: str = COST_GOAL, *, title: str = "Do the work", prior=None):
    return run_step(
        agent=agent,
        goal=goal,
        step_title=title,
        instruction="",
        prior_outputs=prior or [],
        provider=MockProvider(latency_ms=0),
    )


# ------------------------------------------------------------ the tool loop


def test_agent_with_a_tool_calls_it_before_answering():
    result = _run(RESEARCHER)
    assert [outcome.tool_name for outcome in result.tool_outcomes] == ["web_search"]
    assert result.output


def test_agent_without_tools_answers_from_prior_steps_alone():
    result = _run(WRITER, prior=[("Research", "Found https://example.com/paper")])
    assert result.tool_outcomes == []
    assert result.output


def test_tool_calls_are_capped_by_the_step_budget():
    result = _run(RESEARCHER)
    assert len(result.tool_outcomes) <= MAX_TOOL_CALLS_PER_STEP


def test_an_agent_never_invokes_a_tool_outside_its_allowlist():
    result = _run(ANALYST)
    assert all(outcome.tool_name in ANALYST.tools for outcome in result.tool_outcomes)
    assert all(outcome.status == "ok" for outcome in result.tool_outcomes)


def test_tokens_are_accumulated_across_turns():
    assert _run(RESEARCHER).tokens > 0


# ------------------------------------------------- what the step output says


def test_researcher_output_carries_the_urls_its_search_returned():
    result = _run(RESEARCHER)
    urls = [line for line in result.output.splitlines() if "https://" in line]
    assert urls, result.output
    # Every cited URL must have actually come back from the tool.
    tool_text = "\n".join(outcome.result for outcome in result.tool_outcomes)
    for line in urls:
        for token in line.split():
            if token.startswith("https://"):
                assert token in tool_text


def test_analyst_output_shows_the_arithmetic_and_the_computed_total():
    result = _run(ANALYST)
    assert "unit_cost_per_1k" in result.output
    assert "computed total:" in result.output
    assert "Assumption:" in result.output


def test_the_computed_total_is_really_the_arithmetic_result():
    """2,000,000 requests / 1000 * 2.00 == 4000.0, evaluated by the run_code sandbox."""
    result = _run(ANALYST)
    assert "4000.0" in result.output


def test_a_quantity_in_the_goal_drives_the_computation():
    result = _run(ANALYST, goal="Estimate the cost of serving 50000 requests per month.")
    assert "50000" in result.output


def test_writer_carries_the_analysts_arithmetic_into_the_deliverable():
    analysis = _run(ANALYST)
    deliverable = _run(WRITER, prior=[("Run analysis", analysis.output)])
    assert "computed total:" in deliverable.output
    assert "Assumption:" in deliverable.output


def test_writer_leads_with_the_conclusion():
    deliverable = _run(WRITER, prior=[("Research", "Found https://example.com/x")])
    head = deliverable.output.split("\n\n", 2)[:2]
    assert any("Recommendation" in part for part in head), deliverable.output


def test_a_goal_asking_for_one_paragraph_gets_one_paragraph():
    prior = [("Research", "Found https://example.com/a and https://example.com/b")]
    brief = _run(
        WRITER,
        goal="Summarize what this system does in one paragraph for a new engineer.",
        prior=prior,
    )
    verbose = _run(WRITER, goal="Explain the trade-offs in full detail.", prior=prior)

    assert "\n  " not in brief.output  # no bullet sections
    assert len(brief.output.split()) < len(verbose.output.split())


def test_step_output_is_deterministic_for_the_same_inputs():
    assert _run(RESEARCHER).output == _run(RESEARCHER).output


def test_output_discloses_that_results_are_simulated():
    """Nobody should mistake mock output for a real model's answer."""
    assert "mock provider" in _run(RESEARCHER).output


# ------------------------------------------------------- failure handling


class ScriptedProvider(LlmProvider):
    """Replays a fixed sequence of raw model replies, or raises if given none."""

    name = "scripted"

    def __init__(self, *texts: str) -> None:
        super().__init__(model="scripted-1", max_tokens=64)
        self._texts = list(texts)
        self._turn = 0

    def complete(self, *, system, messages, intent="generic", max_tokens=None, temperature=0.2):
        if not self._texts:
            raise LlmError("upstream 503")
        text = self._texts[min(self._turn, len(self._texts) - 1)]
        self._turn += 1
        return LlmResponse(text=text, provider=self.name, model=self.model, tokens=1)


def _run_with(provider: LlmProvider):
    return run_step(
        agent=RESEARCHER,
        goal=COST_GOAL,
        step_title="Do the work",
        instruction="",
        prior_outputs=[],
        provider=provider,
    )


def test_a_provider_error_surfaces_as_a_step_failure():
    with pytest.raises(AgentRunError, match="model call failed"):
        _run_with(ScriptedProvider())


def test_non_json_output_is_accepted_as_the_answer():
    result = _run_with(ScriptedProvider("Here is my plain-text answer."))
    assert result.output == "Here is my plain-text answer."


def test_an_empty_response_is_a_failure():
    with pytest.raises(AgentRunError, match="empty response"):
        _run_with(ScriptedProvider("   "))


def test_a_response_with_neither_output_nor_tool_call_is_a_failure():
    with pytest.raises(AgentRunError, match="neither an output nor a tool call"):
        _run_with(ScriptedProvider('{"thought": "thinking about it"}'))


def test_a_denied_tool_is_recorded_rather_than_raising():
    """The agent asked for a tool outside its allowlist; the loop logs the denial
    and feeds the error back so the step can still finish."""
    result = _run_with(
        ScriptedProvider(
            '{"tool_calls": [{"tool": "run_code", "arguments": {"code": "1"}}]}',
            '{"output": "Could not run code; answering from reasoning."}',
        )
    )
    assert [outcome.status for outcome in result.tool_outcomes] == ["denied"]
    assert result.output == "Could not run code; answering from reasoning."


def test_an_agent_that_only_ever_calls_tools_fails_on_its_turn_budget():
    with pytest.raises(AgentRunError, match="did not finish"):
        _run_with(
            ScriptedProvider('{"tool_calls": [{"tool": "web_search", "arguments": {"query": "x"}}]}')
        )


# ----------------------------------------------------------- prompt shape


def test_prompt_contains_the_labelled_blocks_the_mock_parses():
    prompt = build_agent_prompt(
        goal=COST_GOAL,
        step_title="Gather sources",
        instruction="Search widely.",
        prior_outputs=[("Earlier", "earlier output")],
        tools=["web_search"],
    )
    for label in ("OVERALL_GOAL:", "STEP:", "INSTRUCTION:", "TOOLS:", "PRIOR_STEP_OUTPUTS:"):
        assert label in prompt


def test_prompt_says_none_when_the_agent_has_no_tools():
    prompt = build_agent_prompt(
        goal=COST_GOAL, step_title="Write it up", instruction="", prior_outputs=[], tools=[]
    )
    assert "TOOLS: none" in prompt


def test_prompt_truncates_long_prior_outputs():
    prompt = build_agent_prompt(
        goal=COST_GOAL,
        step_title="Write it up",
        instruction="",
        prior_outputs=[("Earlier", "x" * 5000)],
        tools=[],
    )
    assert len(prompt) < 3000
