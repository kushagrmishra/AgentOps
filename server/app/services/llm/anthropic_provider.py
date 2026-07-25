from __future__ import annotations

import logging

from app.services.llm.base import Intent, LlmError, LlmMessage, LlmProvider, LlmResponse

logger = logging.getLogger(__name__)


class AnthropicProvider(LlmProvider):
    """Thin adapter over the Anthropic Messages API.

    Tool use is expressed through the JSON protocol in the prompts rather than the
    vendor tool-calling schema, so a second provider can be added without
    rewriting the planner or the sub-agent runner.
    """

    name = "anthropic"

    def __init__(self, api_key: str, model: str, max_tokens: int) -> None:
        super().__init__(model=model, max_tokens=max_tokens)
        from anthropic import Anthropic  # imported lazily so the mock path stays light

        self._client = Anthropic(api_key=api_key, timeout=120.0, max_retries=2)

    def complete(
        self,
        *,
        system: str,
        messages: list[LlmMessage],
        intent: Intent = "generic",
        max_tokens: int | None = None,
        temperature: float = 0.2,
    ) -> LlmResponse:
        from anthropic import APIError

        try:
            response = self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens or self.max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": message.role, "content": message.content} for message in messages],
            )
        except APIError as exc:  # pragma: no cover - requires live credentials
            logger.warning("anthropic call failed: %s", exc)
            raise LlmError(f"Anthropic API error: {exc}") from exc

        text = "".join(block.text for block in response.content if getattr(block, "type", "") == "text")
        usage = getattr(response, "usage", None)
        tokens = (getattr(usage, "input_tokens", 0) + getattr(usage, "output_tokens", 0)) if usage else 0

        if not text.strip():
            raise LlmError("Anthropic returned an empty response")

        return LlmResponse(
            text=text,
            provider=self.name,
            model=self.model,
            tokens=tokens,
            meta={"intent": intent, "stop_reason": getattr(response, "stop_reason", None)},
        )
