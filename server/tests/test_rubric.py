"""The rubric scorer: which requirements an expectation implies, whether an
output satisfies them, and how that blends with topic coverage.

This is the scorer the eval harness falls back to whenever no LLM judge answers,
so its grading has to be defensible on its own.
"""

from __future__ import annotations

import pytest

from app.services.rubric import score_against_expectation

CITED_EXPECTATION = "A summary that cites sources with URLs."
COMPUTE_EXPECTATION = "A brief showing the arithmetic, its assumptions, and a total figure."


# ------------------------------------------------- requirement detection


def test_expectation_asking_for_citations_requires_urls():
    with_urls = score_against_expectation(
        "Vector search favours HNSW indexes. See https://arxiv.org/abs/1603.09320", CITED_EXPECTATION
    )
    without_urls = score_against_expectation(
        "Vector search favours HNSW indexes, according to the literature.", CITED_EXPECTATION
    )
    assert "cites sources" in with_urls.met
    assert "cites sources" in without_urls.unmet
    assert with_urls.score > without_urls.score


def test_expectation_asking_for_arithmetic_requires_a_visible_computation():
    shown = score_against_expectation(
        "requests = 2000000\nunit_cost_per_1k = 2.00\n=> total 4000.0\nAssumption: list price.",
        COMPUTE_EXPECTATION,
    )
    asserted = score_against_expectation(
        "The monthly total is roughly four thousand dollars.", COMPUTE_EXPECTATION
    )
    assert "shows the computation" in shown.met
    assert "states assumptions" in shown.met
    assert "shows the computation" in asserted.unmet
    assert shown.score > asserted.score


def test_expectation_asking_for_a_checklist_requires_enumerated_items():
    listed = score_against_expectation(
        "- Validate tool inputs\n- Sandbox the executor\n- Log every call\n- Pin the allowlist",
        "A checklist of defenses ordered by impact.",
    )
    prose = score_against_expectation(
        "You should validate inputs and sandbox the executor.",
        "A checklist of defenses ordered by impact.",
    )
    assert "is an enumerated list" in listed.met
    assert "is an enumerated list" in prose.unmet


def test_expectation_asking_for_one_paragraph_penalises_a_long_report():
    brief = score_against_expectation(
        "A planner splits the goal into subtasks that sub-agents run with tools.",
        "A single paragraph explaining the system.",
    )
    sprawling = score_against_expectation(
        "\n".join(f"- point number {index} about the system" for index in range(30)),
        "A single paragraph explaining the system.",
    )
    assert "stays brief" in brief.met
    assert "stays brief" in sprawling.unmet


def test_requirements_are_only_applied_when_the_expectation_asks_for_them():
    """An expectation about subject matter alone is graded on coverage only."""
    result = score_against_expectation(
        "Photosynthesis converts light into chemical energy.",
        "An explanation of photosynthesis in plants.",
    )
    assert result.met == [] and result.unmet == []
    assert result.score == pytest.approx(result.keyword_score, abs=1e-3)


# ------------------------------------------------------------- scoring


def test_satisfying_every_requirement_beats_matching_only_vocabulary():
    """The point of the rubric: substance should outrank echoing the wording."""
    substantive = score_against_expectation(
        "HNSW at 12ms p99 vs IVF at 31ms. See https://arxiv.org/abs/1603.09320 "
        "Recommendation: start with HNSW.",
        "Compares two options and cites sources, ending with a recommendation.",
    )
    parroting = score_against_expectation(
        "This compares two options and cites sources, ending with a recommendation.",
        "Compares two options and cites sources, ending with a recommendation.",
    )
    assert substantive.score > parroting.score


def test_empty_output_scores_zero():
    result = score_against_expectation("   ", CITED_EXPECTATION)
    assert result.score == 0.0
    assert result.met == []


def test_scores_stay_within_the_unit_interval():
    cases = [
        ("", ""),
        ("anything", ""),
        ("", CITED_EXPECTATION),
        (CITED_EXPECTATION, CITED_EXPECTATION),
        ("https://example.com " * 50, CITED_EXPECTATION),
    ]
    for actual, expected in cases:
        assert 0.0 <= score_against_expectation(actual, expected).score <= 1.0


def test_summary_names_what_was_met_and_missed():
    result = score_against_expectation(
        "See https://example.com/paper", COMPUTE_EXPECTATION
    )
    assert "Met:" in result.summary
    assert "Missed:" in result.summary
    assert "shows the computation" in result.summary


def test_scoring_is_deterministic():
    output = "requests = 10\n=> total 25.0\nAssumption: flat rate.\nRecommendation: proceed."
    scores = {score_against_expectation(output, COMPUTE_EXPECTATION).score for _ in range(5)}
    assert len(scores) == 1
