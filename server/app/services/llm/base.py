from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

Intent = Literal["plan", "agent", "judge", "generic"]


@dataclass(slots=True)
class LlmMessage:
    role: Literal["user", "assistant"]
    content: str


@dataclass(slots=True)
class LlmResponse:
    text: str
    provider: str
    model: str
    tokens: int = 0
    meta: dict[str, Any] = field(default_factory=dict)


class LlmError(RuntimeError):
    """Raised when a provider call fails in a way callers should surface."""


_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def extract_json_object(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of a model response.

    Models wrap JSON in prose or code fences often enough that this belongs in one
    place rather than at every call site.
    """
    candidates: list[str] = []
    stripped = text.strip()
    if stripped:
        candidates.append(stripped)
    candidates.extend(match.group(1) for match in _FENCE_RE.finditer(text))

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    raise LlmError("model response did not contain a JSON object")


class LlmProvider(ABC):
    """Provider-agnostic surface. Swapping providers must not touch callers."""

    name: str = "base"

    def __init__(self, model: str, max_tokens: int) -> None:
        self.model = model
        self.max_tokens = max_tokens

    @abstractmethod
    def complete(
        self,
        *,
        system: str,
        messages: list[LlmMessage],
        intent: Intent = "generic",
        max_tokens: int | None = None,
        temperature: float = 0.2,
    ) -> LlmResponse:
        """`intent` is a hint the mock provider uses to shape deterministic
        replies; hosted providers ignore it."""

    def complete_json(
        self,
        *,
        system: str,
        messages: list[LlmMessage],
        intent: Intent = "generic",
        max_tokens: int | None = None,
        temperature: float = 0.0,
    ) -> tuple[dict[str, Any], LlmResponse]:
        response = self.complete(
            system=system,
            messages=messages,
            intent=intent,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return extract_json_object(response.text), response
