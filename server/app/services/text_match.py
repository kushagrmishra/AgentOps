from __future__ import annotations

import re
from dataclasses import dataclass

_WORD_RE = re.compile(r"[a-z0-9][a-z0-9\-_/.]*")

# Words carry no signal about whether an outcome was met, so they are excluded
# from coverage scoring.
STOPWORDS = frozenset(
    """
    a about above after again against all also am an and any are as at be because been before being
    below between both but by can cannot could did do does doing down during each few for from further
    had has have having he her here hers him his how i if in into is it its itself just me more most my
    no nor not of off on once only or other our out over own same she should so some such than that the
    their them then there these they this those through to too under until up very was we were what when
    where which while who whom why will with would you your
    """.split()
)


def tokenize(text: str) -> list[str]:
    """Split into comparable words.

    Internal punctuation is kept, so `tool-calling` and `docs.python.org` survive
    as single tokens, but trailing punctuation is dropped — otherwise a word at the
    end of a sentence ("recommendation.") would never match the same word used
    anywhere else.
    """
    tokens = (token.rstrip("._-/") for token in _WORD_RE.findall(text.lower()))
    return [token for token in tokens if token and token not in STOPWORDS]


def keywords(text: str, *, min_length: int = 3) -> set[str]:
    return {token for token in tokenize(text) if len(token) >= min_length}


@dataclass(slots=True)
class OverlapScore:
    score: float
    matched: list[str]
    missing: list[str]

    @property
    def coverage_pct(self) -> int:
        return round(self.score * 100)


def keyword_overlap(actual: str, expected: str) -> OverlapScore:
    """Fraction of the expected outcome's keywords present in the actual output.

    Deliberately simple and deterministic: it is the fallback when no judge model
    is reachable, and it makes the scoring path unit-testable without an LLM.
    """
    expected_keys = keywords(expected)
    if not expected_keys:
        # Nothing asserted, so anything non-empty satisfies it.
        return OverlapScore(1.0 if actual.strip() else 0.0, [], [])

    actual_keys = keywords(actual)
    matched = sorted(key for key in expected_keys if key in actual_keys)
    missing = sorted(key for key in expected_keys if key not in actual_keys)
    return OverlapScore(len(matched) / len(expected_keys), matched, missing)
