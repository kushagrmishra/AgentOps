"""Planner task-breakdown logic.

`normalize_plan` is the trust boundary between untrusted model output and the
orchestrator, so most of these cases are deliberately malformed plans.
"""

from __future__ import annotations

import pytest

from app.core.config import MAX_STEPS_PER_RUN
from app.services.llm import MockProvider
from app.services.planner import (
    AgentSpec,
    PlannerError,
    build_planner_prompt,
    create_plan,
    normalize_plan,
    render_agent_roster,
)

GOAL = "Compare vector databases for RAG and recommend one."


@pytest.fixture
def agents() -> list[AgentSpec]:
    return [
        AgentSpec(id="a1", name="researcher", description="Finds sources.", tools=["web_search"]),
        AgentSpec(id="a2", name="analyst", description="Runs numbers.", tools=["run_code"]),
        AgentSpec(id="a3", name="writer", description="Writes it up.", tools=[]),
    ]


# --------------------------------------------------------------- happy path


def test_normalize_plan_preserves_order_and_assigns_agents(agents):
    plan = normalize_plan(
        {
            "summary": "Gather, quantify, then write.",
            "steps": [
                {"title": "Find sources", "instruction": "Search the web.", "agent": "researcher"},
                {"title": "Compute cost", "instruction": "Do the math.", "agent": "analyst"},
                {"title": "Write brief", "instruction": "Summarise.", "agent": "writer"},
            ],
        },
        agents,
        GOAL,
    )

    assert plan.summary == "Gather, quantify, then write."
    assert [step.index for step in plan.steps] == [0, 1, 2]
    assert [step.agent_name for step in plan.steps] == ["researcher", "analyst", "writer"]
    assert [step.agent_id for step in plan.steps] == ["a1", "a2", "a3"]


def test_normalize_plan_synthesises_missing_summary(agents):
    plan = normalize_plan({"steps": [{"title": "Do it", "agent": "writer"}]}, agents, GOAL)
    assert "1 sequential subtask" in plan.summary


def test_normalize_plan_backfills_instruction_with_the_goal(agents):
    plan = normalize_plan({"steps": [{"title": "Do it", "agent": "writer"}]}, agents, GOAL)
    assert GOAL in plan.steps[0].instruction


# ------------------------------------------------- agent name resolution


@pytest.mark.parametrize("requested", ["researcher", "Researcher", "RESEARCHER", " researcher "])
def test_agent_names_match_case_and_whitespace_insensitively(agents, requested):
    plan = normalize_plan({"steps": [{"title": "Find it", "agent": requested}]}, agents, GOAL)
    assert plan.steps[0].agent_name == "researcher"


def test_agent_names_match_across_separator_styles():
    agents = [AgentSpec(id="a1", name="deep researcher", tools=["web_search"])]
    plan = normalize_plan({"steps": [{"title": "Find it", "agent": "deep_researcher"}]}, agents, GOAL)
    assert plan.steps[0].agent_name == "deep researcher"


def test_hallucinated_agent_is_never_invented(agents):
    """An unknown name must resolve to a real agent, not pass through."""
    plan = normalize_plan(
        {"steps": [{"title": "Find sources", "agent": "ultra-agent-9000"}]}, agents, GOAL
    )
    assert plan.steps[0].agent_name in {agent.name for agent in agents}
    assert plan.steps[0].agent_id is not None


def test_missing_assignment_falls_back_to_tool_fit(agents):
    plan = normalize_plan(
        {
            "steps": [
                {"title": "Search for benchmark sources", "instruction": "look up papers"},
                {"title": "Calculate the monthly cost", "instruction": "compute totals"},
            ]
        },
        agents,
        GOAL,
    )
    assert plan.steps[0].agent_name == "researcher"  # search -> web_search
    assert plan.steps[1].agent_name == "analyst"  # calculate -> run_code


def test_steps_are_unassigned_when_no_agents_exist():
    plan = normalize_plan({"steps": [{"title": "Do it", "agent": "researcher"}]}, [], GOAL)
    assert plan.steps[0].agent_name == "unassigned"
    assert plan.steps[0].agent_id is None


# ----------------------------------------------------- malformed payloads


def test_step_count_is_capped(agents):
    raw = {"steps": [{"title": f"Step {n}", "agent": "writer"} for n in range(MAX_STEPS_PER_RUN + 5)]}
    plan = normalize_plan(raw, agents, GOAL)
    assert len(plan.steps) == MAX_STEPS_PER_RUN


def test_bare_strings_are_coerced_into_steps(agents):
    plan = normalize_plan({"steps": ["Find the sources", "Write the brief"]}, agents, GOAL)
    assert [step.title for step in plan.steps] == ["Find the sources", "Write the brief"]


def test_single_step_object_is_wrapped_in_a_list(agents):
    plan = normalize_plan({"steps": {"title": "Just one", "agent": "writer"}}, agents, GOAL)
    assert len(plan.steps) == 1


def test_alternate_field_names_are_accepted(agents):
    plan = normalize_plan(
        {"steps": [{"task": "Find it", "description": "Search.", "agent_name": "researcher"}]},
        agents,
        GOAL,
    )
    step = plan.steps[0]
    assert (step.title, step.instruction, step.agent_name) == ("Find it", "Search.", "researcher")


def test_titleless_steps_derive_a_title_from_the_instruction(agents):
    plan = normalize_plan(
        {"steps": [{"instruction": "Search for the latest RAG benchmarks."}]}, agents, GOAL
    )
    assert plan.steps[0].title == "Search for the latest RAG benchmarks."


def test_unusable_entries_are_dropped_not_fatal(agents):
    plan = normalize_plan(
        {"steps": [{"title": "  "}, 42, None, {"title": "Real step", "agent": "writer"}]},
        agents,
        GOAL,
    )
    assert [step.title for step in plan.steps] == ["Real step"]
    assert plan.steps[0].index == 0


def test_whitespace_in_titles_is_collapsed(agents):
    plan = normalize_plan({"steps": [{"title": "Find\n\n  the   sources"}]}, agents, GOAL)
    assert plan.steps[0].title == "Find the sources"


def test_long_titles_are_truncated(agents):
    plan = normalize_plan({"steps": [{"title": "x" * 500, "agent": "writer"}]}, agents, GOAL)
    assert len(plan.steps[0].title) <= 300


@pytest.mark.parametrize(
    "raw",
    [
        ["not", "a", "dict"],
        "a string",
        {"steps": []},
        {"steps": "nope"},
        {"summary": "no steps key"},
        {"steps": [{"title": ""}, {"nothing": "usable"}]},
    ],
)
def test_unusable_plans_raise(agents, raw):
    with pytest.raises(PlannerError):
        normalize_plan(raw, agents, GOAL)


# ------------------------------------------------------- prompt assembly


def test_roster_exposes_names_and_tools_to_the_model(agents):
    roster = render_agent_roster(agents)
    assert "name: researcher | tools: web_search" in roster
    assert "tools: none" in roster  # writer has no tools


def test_planner_prompt_carries_goal_agents_and_limit(agents):
    system, user = build_planner_prompt(GOAL, agents)
    assert str(MAX_STEPS_PER_RUN) in system
    assert GOAL in user
    for agent in agents:
        assert agent.name in user
    assert "web_search" in user and "run_code" in user


# ---------------------------------------------- end-to-end via the mock


def test_create_plan_produces_executable_steps(agents):
    plan = create_plan(GOAL, agents, MockProvider())

    assert 1 <= len(plan.steps) <= MAX_STEPS_PER_RUN
    assert plan.tokens > 0
    known = {agent.name for agent in agents}
    for position, step in enumerate(plan.steps):
        assert step.index == position
        assert step.title
        assert step.instruction
        assert step.agent_name in known


def test_create_plan_is_deterministic_under_the_mock(agents):
    """Reproducibility is what makes the eval harness comparable over time."""
    first = create_plan(GOAL, agents, MockProvider())
    second = create_plan(GOAL, agents, MockProvider())
    assert [(s.title, s.agent_name) for s in first.steps] == [
        (s.title, s.agent_name) for s in second.steps
    ]


def test_create_plan_routes_research_goals_to_a_search_agent(agents):
    plan = create_plan("Research the latest guidance on prompt injection defenses.", agents, MockProvider())
    assert plan.steps[0].agent_name == "researcher"


def test_create_plan_rejects_a_provider_that_returns_no_json(agents):
    class BrokenProvider(MockProvider):
        def complete(self, **kwargs):  # type: ignore[override]
            response = super().complete(**kwargs)
            response.text = "I'm afraid I can't do that."
            return response

    with pytest.raises(PlannerError):
        create_plan(GOAL, agents, BrokenProvider())
