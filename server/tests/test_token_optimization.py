from app.services.agent_runner import build_agent_prompt
from app.services.planner import normalize_plan


def test_dependency_aware_step_context_filtering():
    prior_outputs = [
        ("Step 0: Scrape SEC 10-K Filings", "A" * 3000),
        ("Step 1: Scrape Twitter / Social Sentiment", "B" * 3000),
        ("Step 2: Scrape Weather Data", "C" * 3000),
    ]

    # Step 3 only depends on Step 0 (SEC Filings)
    prompt = build_agent_prompt(
        goal="Audit SEC risks",
        step_title="Financial Ratio Analysis",
        instruction="Calculate quick ratio from balance sheet",
        prior_outputs=prior_outputs,
        tools=["run_code"],
        is_final_step=False,
        dependencies=[0],
    )

    # Should contain Step 0 output
    assert "Step 0: Scrape SEC 10-K Filings" in prompt
    assert "A" * 1000 in prompt

    # Should NOT contain unneeded Step 1 or Step 2 outputs
    assert "Step 1: Scrape Twitter" not in prompt
    assert "Step 2: Scrape Weather Data" not in prompt


def test_final_synthesis_step_receives_complete_history():
    prior_outputs = [
        ("Step 0: Research", "Findings Alpha"),
        ("Step 1: Analysis", "Computations Beta"),
    ]

    # Final step should receive all prior outputs even if specific dependencies were declared
    prompt = build_agent_prompt(
        goal="Write executive report",
        step_title="Author Final Deliverable",
        instruction="Produce full markdown report",
        prior_outputs=prior_outputs,
        tools=["write_file"],
        is_final_step=True,
        dependencies=[1],
    )

    assert "Findings Alpha" in prompt
    assert "Computations Beta" in prompt
    assert "FINAL_SYNTHESIS" in prompt


def test_planner_parses_step_dependencies():
    raw_response = {
        "summary": "Plan decomposed with dependencies",
        "steps": [
            {
                "title": "Gather 10-K filings",
                "instruction": "Fetch SEC Edgar filings",
                "agent": "researcher",
                "depends_on": [],
            },
            {
                "title": "Analyze balance sheet",
                "instruction": "Compute ratios",
                "agent": "analyst",
                "depends_on": [0],
            },
            {
                "title": "Synthesize report",
                "instruction": "Generate executive summary",
                "agent": "writer",
                "depends_on": [0, 1],
            },
        ],
    }

    plan = normalize_plan(raw_response, agents=[], goal="Audit SEC filings")
    assert len(plan.steps) == 3
    assert plan.steps[0].depends_on == []
    assert plan.steps[1].depends_on == [0]
    assert plan.steps[2].depends_on == [0, 1]
