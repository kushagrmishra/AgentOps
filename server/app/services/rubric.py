"""Rubric scoring of an output against a stated expectation.

The eval harness prefers an LLM judge, but it needs a deterministic scorer for
the two cases where no judge answers: none is configured, and the judge call
failed. Bare keyword overlap grades those cases badly, because expectations are
written as *requirements* — "cites sources with URLs", "shows the arithmetic",
"ends with a concrete recommendation" — whose vocabulary a correct answer has no
reason to repeat. An output can satisfy every requirement and still score near
zero on word overlap.

So this reads the requirements out of the expectation and looks for evidence of
each in the output, then blends that with keyword coverage for the parts of an
expectation that really are about subject matter.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.services.text_match import keyword_overlap, keywords

__all__ = ["RubricScore", "REQUIREMENTS", "score_against_expectation"]

# How much of the blended score comes from requirement checks vs. keyword
# coverage. Requirements dominate because they test substance.
_RUBRIC_WEIGHT = 0.6

_URL_RE = re.compile(r"https?://\S+")
_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\[\d+\]|\(?\d+[.)])\s+\S", re.MULTILINE)
_EQUATION_RE = re.compile(r"[a-z_]{2,}\s*=\s*[^\n]*\d|=>\s*[^\n]*\d", re.IGNORECASE)
_QUANTITY_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
_COMPARISON_RE = re.compile(r"\bvs\.?\b|\bversus\b|\bcompared with\b|\bwhereas\b|\bwhile\b")


def _has_urls(output: str) -> bool:
    return bool(_URL_RE.search(output))


def _bullet_count(output: str) -> int:
    return len(_BULLET_RE.findall(output))


def _has_comparison(output: str) -> bool:
    return bool(_COMPARISON_RE.search(output)) or _bullet_count(output) >= 2


def _has_computation(output: str) -> bool:
    return bool(_EQUATION_RE.search(output))


def _has_quantity(output: str) -> bool:
    return any(len(match.replace(",", "").replace(".", "")) >= 2 for match in _QUANTITY_RE.findall(output))


def _is_brief(output: str) -> bool:
    # "one paragraph" / "short" answers: a few hundred words at most, and not a
    # bullet-point dump.
    return len(output.split()) <= 220 and _bullet_count(output) <= 2


@dataclass(frozen=True, slots=True)
class Requirement:
    """One thing an expectation can ask for, and how to detect it was delivered."""

    name: str
    triggers: frozenset[str]
    satisfied: Callable[[str], bool]


REQUIREMENTS: tuple[Requirement, ...] = (
    Requirement(
        name="cites sources",
        triggers=frozenset(
            {"cite", "cites", "cited", "citing", "citation", "citations", "source", "sources",
             "url", "urls", "link", "links", "grounded", "reference", "references"}
        ),
        satisfied=_has_urls,
    ),
    Requirement(
        name="compares options",
        triggers=frozenset(
            {"compare", "compares", "comparing", "comparison", "versus", "options", "alternatives",
             "trade-offs", "tradeoffs", "trade-off", "two", "three", "several"}
        ),
        satisfied=_has_comparison,
    ),
    Requirement(
        name="shows the computation",
        triggers=frozenset(
            {"arithmetic", "computation", "computations", "computing", "calculation", "calculations",
             "math", "formula", "breakdown", "derivation"}
        ),
        satisfied=_has_computation,
    ),
    Requirement(
        name="reports a figure",
        triggers=frozenset(
            {"figure", "figures", "total", "totals", "number", "amount", "cost",
             "estimate", "quantity", "metric", "metrics"}
        ),
        satisfied=_has_quantity,
    ),
    Requirement(
        name="states assumptions",
        triggers=frozenset({"assumption", "assumptions", "assume", "assumes", "assuming", "caveat", "caveats"}),
        satisfied=lambda output: "assum" in output.lower() or "caveat" in output.lower(),
    ),
    Requirement(
        name="gives a recommendation",
        triggers=frozenset(
            {"recommend", "recommends", "recommending", "recommendation", "recommendations", "conclusion",
             "concludes", "advice", "verdict", "suggests"}
        ),
        satisfied=lambda output: any(
            word in output.lower() for word in ("recommend", "conclusion", "conclude", "we suggest")
        ),
    ),
    Requirement(
        name="is an enumerated list",
        triggers=frozenset({"checklist", "list", "listing", "ordered", "ranked", "bullets", "bulleted", "items"}),
        satisfied=lambda output: _bullet_count(output) >= 3,
    ),
    Requirement(
        name="stays brief",
        triggers=frozenset({"paragraph", "brief", "short", "concise", "one-paragraph", "sentence"}),
        satisfied=_is_brief,
    ),
)


@dataclass(slots=True)
class RubricScore:
    score: float
    met: list[str]
    unmet: list[str]
    matched_keywords: list[str]
    missing_keywords: list[str]
    keyword_score: float

    @property
    def summary(self) -> str:
        """A one-line explanation of the grade, for the eval results table."""
        parts = []
        if self.met or self.unmet:
            parts.append(f"Met: {', '.join(self.met) or 'none'}.")
            if self.unmet:
                parts.append(f"Missed: {', '.join(self.unmet)}.")
        parts.append(
            f"Topic coverage {round(self.keyword_score * 100)}% "
            f"(missing: {', '.join(self.missing_keywords[:6]) or 'none'})."
        )
        return " ".join(parts)


def _required(expected: str) -> list[Requirement]:
    expectation_words = keywords(expected, min_length=2)
    return [
        requirement for requirement in REQUIREMENTS if expectation_words & requirement.triggers
    ]


def score_against_expectation(actual: str, expected: str) -> RubricScore:
    """Grade `actual` against `expected` on requirements plus topic coverage."""
    actual = actual or ""
    overlap = keyword_overlap(actual, expected or "")

    if not actual.strip():
        return RubricScore(0.0, [], [], [], overlap.missing, 0.0)

    required = _required(expected or "")
    if not required:
        # The expectation asserts subject matter only, so coverage is the whole grade.
        return RubricScore(
            score=round(overlap.score, 3),
            met=[],
            unmet=[],
            matched_keywords=overlap.matched,
            missing_keywords=overlap.missing,
            keyword_score=overlap.score,
        )

    met = [requirement.name for requirement in required if requirement.satisfied(actual)]
    unmet = [requirement.name for requirement in required if requirement.name not in met]
    rubric_ratio = len(met) / len(required)

    score = _RUBRIC_WEIGHT * rubric_ratio + (1 - _RUBRIC_WEIGHT) * overlap.score
    return RubricScore(
        score=round(score, 3),
        met=met,
        unmet=unmet,
        matched_keywords=overlap.matched,
        missing_keywords=overlap.missing,
        keyword_score=overlap.score,
    )
