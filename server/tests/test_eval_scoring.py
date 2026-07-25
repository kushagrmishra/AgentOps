"""Eval harness scoring: score normalisation, the heuristic scorer, and the
LLM-as-judge path including its degradation behaviour."""

from __future__ import annotations

import pytest

from app.models import PASS_THRESHOLD
from app.services.evals import (
    build_judge_prompt,
    heuristic_score,
    normalize_score,
    score_output,
)
from app.services.llm import LlmError, LlmMessage, LlmProvider, LlmResponse, MockProvider
from app.services.text_match import keyword_overlap

GOAL = "Summarise the trade-offs between vector databases."
EXPECTED = "A summary comparing latency and recall with a concrete recommendation."
# An answer that both satisfies every requirement EXPECTED implies and covers its
# subject matter. Note that EXPECTED itself does not qualify: it *describes* a
# comparison rather than making one, which the rubric scorer is meant to notice.
SATISFYING = (
    "Summary comparing latency and recall: HNSW at 12ms p99 vs IVF at 31ms, "
    "recall 0.94 vs 0.88. Concrete recommendation: start with HNSW."
)


class StubProvider(LlmProvider):
    """Returns a canned response, or raises, so judge failure paths are testable."""

    name = "stub"

    def __init__(self, text: str = "", error: str | None = None) -> None:
        super().__init__(model="stub-1", max_tokens=256)
        self._text = text
        self._error = error

    def complete(self, *, system, messages, intent="generic", max_tokens=None, temperature=0.2):
        if self._error:
            raise LlmError(self._error)
        return LlmResponse(text=self._text, provider=self.name, model=self.model, tokens=7)


# ------------------------------------------------------ score normalisation


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (1, 1.0),
        (0, 0.0),
        (0.85, 0.85),
        ("0.85", 0.85),
        (" 0.85 ", 0.85),
        (8, 0.8),  # a 0-10 rating
        (8.5, 0.85),
        (85, 0.85),  # a percentage
        ("85%", 0.85),
        ("8/10", 0.8),
        ("17/20", 0.85),
        (-4, 0.0),  # clamped
        (5000, 1.0),  # clamped
    ],
)
def test_scores_are_normalised_to_the_unit_interval(raw, expected):
    assert normalize_score(raw) == pytest.approx(expected)


@pytest.mark.parametrize(
    "raw",
    [None, True, False, "", "excellent", "n/a", "8/0", float("nan"), float("inf"), {}, []],
)
def test_unusable_scores_are_rejected(raw):
    assert normalize_score(raw) is None


def test_every_normalised_score_stays_in_range():
    for raw in (-1, 0, 0.5, 1, 7, 42, 99.9, 100, 1e9):
        value = normalize_score(raw)
        assert value is not None and 0.0 <= value <= 1.0


# --------------------------------------------------------- heuristic scorer


def test_an_answer_meeting_every_requirement_scores_full_marks():
    result = heuristic_score(SATISFYING, EXPECTED)
    assert result.score == 1.0
    assert result.passed is True
    assert result.method == "heuristic"


def test_restating_the_expectation_does_not_earn_full_marks():
    """Describing the required shape is not the same as delivering it."""
    assert heuristic_score(EXPECTED, EXPECTED).score < 1.0


def test_unrelated_output_fails_with_zero():
    result = heuristic_score("Pineapples grow in tropical climates.", EXPECTED)
    assert result.score == 0.0
    assert result.passed is False


def test_partial_coverage_lands_between():
    result = heuristic_score("A summary comparing latency.", EXPECTED)
    assert 0.0 < result.score < 1.0


def test_heuristic_reasoning_explains_what_was_missing():
    """The reasoning lands in the eval results table, so it has to be diagnostic."""
    result = heuristic_score("A summary comparing latency.", EXPECTED)
    assert "gives a recommendation" in result.reasoning  # unmet requirement
    assert "recall" in result.reasoning  # uncovered topic term


def test_stopword_only_expectation_accepts_any_nonempty_output():
    overlap = keyword_overlap("anything at all", "the and of it")
    assert overlap.score == 1.0


def test_pass_threshold_boundary_is_inclusive():
    """Constructed so coverage is exactly the threshold."""
    expected = "alpha beta gamma delta epsilon fennel gimlet horizon indigo jackal"
    actual = "alpha beta gamma delta epsilon fennel gimlet"  # 7 of 10
    result = heuristic_score(actual, expected)
    assert result.score == pytest.approx(0.7)
    assert PASS_THRESHOLD == 0.7
    assert result.passed is True


# ----------------------------------------------------------- score_output


def test_empty_output_scores_zero_without_calling_the_judge():
    result = score_output(goal=GOAL, expected=EXPECTED, actual="   ", provider=StubProvider(error="boom"))
    assert result.score == 0.0
    assert result.passed is False
    assert "no output" in result.reasoning.lower()


def test_no_provider_uses_the_heuristic_scorer():
    result = score_output(goal=GOAL, expected=EXPECTED, actual=SATISFYING, provider=None)
    assert result.method == "heuristic"
    assert result.score == 1.0


def test_judge_score_and_reasoning_are_used():
    provider = StubProvider('{"score": 0.9, "reasoning": "Covers both metrics."}')
    result = score_output(goal=GOAL, expected=EXPECTED, actual="anything", provider=provider)
    assert result.score == 0.9
    assert result.passed is True
    assert result.reasoning == "Covers both metrics."
    assert result.method == "llm-judge:stub"


def test_judge_output_wrapped_in_prose_and_fences_still_parses():
    provider = StubProvider('Here you go:\n```json\n{"score": "7/10", "reasoning": "ok"}\n```')
    result = score_output(goal=GOAL, expected=EXPECTED, actual="anything", provider=provider)
    assert result.score == pytest.approx(0.7)


def test_judge_failure_degrades_to_the_heuristic_scorer():
    provider = StubProvider(error="429 rate limited")
    result = score_output(goal=GOAL, expected=EXPECTED, actual=SATISFYING, provider=provider)
    assert result.method == "heuristic"
    assert "Judge unavailable" in result.reasoning
    assert "429 rate limited" in result.reasoning
    assert result.score == 1.0  # heuristic still scored the output


def test_unusable_judge_score_degrades_to_the_heuristic_scorer():
    provider = StubProvider('{"score": "excellent", "reasoning": "great"}')
    result = score_output(goal=GOAL, expected=EXPECTED, actual=SATISFYING, provider=provider)
    assert result.method == "heuristic"
    assert "unusable score" in result.reasoning


def test_non_json_judge_reply_degrades_to_the_heuristic_scorer():
    provider = StubProvider("I would rate this quite highly.")
    result = score_output(goal=GOAL, expected=EXPECTED, actual=SATISFYING, provider=provider)
    assert result.method == "heuristic"


def test_judge_reasoning_is_never_blank():
    provider = StubProvider('{"score": 0.5}')
    result = score_output(goal=GOAL, expected=EXPECTED, actual="partial", provider=provider)
    assert result.reasoning.strip()


def test_mock_judge_grades_on_the_rubric():
    """The mock judge keeps the harness runnable and reproducible with no API key."""
    result = score_output(goal=GOAL, expected=EXPECTED, actual=SATISFYING, provider=MockProvider())
    assert result.method == "llm-judge:mock"
    assert result.score == 1.0
    assert result.passed is True


def test_mock_judge_rewards_substance_over_matching_wording():
    judge = MockProvider()
    expected = "Compares two options and cites sources, ending with a recommendation."
    substantive = score_output(
        goal=GOAL,
        expected=expected,
        actual=(
            "HNSW holds 12ms p99 vs IVF at 31ms on the same corpus.\n"
            "[1] https://arxiv.org/abs/1603.09320\n"
            "Recommendation: start with HNSW and revisit if recall drops."
        ),
        provider=judge,
    )
    parroting = score_output(
        goal=GOAL, expected=expected, actual=expected, provider=judge
    )
    assert substantive.score > parroting.score


def test_mock_judge_fails_off_topic_output():
    result = score_output(
        goal=GOAL, expected=EXPECTED, actual="Pineapples grow in the tropics.", provider=MockProvider()
    )
    assert result.passed is False


def test_judge_prompt_contains_all_three_inputs():
    prompt = build_judge_prompt(GOAL, EXPECTED, "the actual output")
    assert GOAL in prompt and EXPECTED in prompt and "the actual output" in prompt


def test_judge_prompt_truncates_very_long_output():
    prompt = build_judge_prompt(GOAL, EXPECTED, "x" * 20_000)
    assert len(prompt) < 10_000


def test_judge_receives_the_expected_outcome_as_a_labelled_block():
    """The mock judge parses these labels, so the shape is load-bearing."""
    captured: list[LlmMessage] = []

    class CapturingProvider(StubProvider):
        def complete(self, *, system, messages, intent="generic", max_tokens=None, temperature=0.2):
            captured.extend(messages)
            return super().complete(system=system, messages=messages, intent=intent)

    score_output(
        goal=GOAL,
        expected=EXPECTED,
        actual="something",
        provider=CapturingProvider('{"score": 1, "reasoning": "y"}'),
    )
    assert "EXPECTED_OUTCOME:" in captured[0].content
    assert "ACTUAL_OUTPUT:" in captured[0].content
