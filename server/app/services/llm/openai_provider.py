from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.services.llm.base import Intent, LlmError, LlmMessage, LlmProvider, LlmResponse

if TYPE_CHECKING:
    import httpx

logger = logging.getLogger(__name__)


class OpenAICompatibleProvider(LlmProvider):
    """Adapter for any OpenAI-compatible Chat Completions API.

    Works against any host implementing ``POST {base_url}/chat/completions`` with a
    ``Authorization: Bearer <key>`` header — Groq, OpenRouter, OpenAI, a local server, etc.

    Includes dedicated support for:
    - Groq: automatic model fallback, rate-limit backoff, token cap protection.
    - OpenRouter: required HTTP-Referer/X-Title headers, model prefix mapping, reasoning extraction.
    """

    name = "openai"

    GROQ_DEFAULT_MODEL = "openai/gpt-oss-20b"
    OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini"

    def __init__(self, *, api_key: str, base_url: str, model: str, max_tokens: int) -> None:
        import httpx  # imported lazily so the mock/anthropic paths stay light

        self._base_url = base_url.rstrip("/")
        self._is_groq = "groq.com" in self._base_url.lower() or api_key.startswith("gsk_")
        self._is_openrouter = "openrouter.ai" in self._base_url.lower() or api_key.startswith("sk-or-")

        # Normalize model for provider
        resolved_model = self._normalize_model(model)
        super().__init__(model=resolved_model, max_tokens=max_tokens)

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if self._is_openrouter:
            headers["HTTP-Referer"] = "http://localhost:5173"
            headers["X-Title"] = "AgentOps"

        self._client = httpx.Client(
            headers=headers,
            timeout=httpx.Timeout(60.0, connect=10.0),
        )

    def _normalize_model(self, model: str) -> str:
        if self._is_groq:
            known_groq = {
                "openai/gpt-oss-20b",
                "openai/gpt-oss-120b",
                "qwen/qwen3.6-27b",
                "qwen/qwen3.8-27b",
                "groq/compound",
                "groq/compound-mini",
                "meta-llama/llama-prompt-guard-2-86m",
            }
            if model in known_groq:
                return model
            logger.info("Normalizing model %s to Groq default %s", model, self.GROQ_DEFAULT_MODEL)
            return self.GROQ_DEFAULT_MODEL

        if self._is_openrouter:
            if "/" in model:
                return model
            # Auto-prefix common models for OpenRouter
            prefix_map = {
                "gpt-4o": "openai/gpt-4o",
                "gpt-4o-mini": "openai/gpt-4o-mini",
                "o1": "openai/o1",
                "o3-mini": "openai/o3-mini",
                "claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
                "claude-3-5-haiku": "anthropic/claude-3.5-haiku",
                "claude-sonnet-4-5": "anthropic/claude-3.5-sonnet",
                "deepseek-chat": "deepseek/deepseek-chat",
                "deepseek-reasoner": "deepseek/deepseek-r1",
                "deepseek-r1": "deepseek/deepseek-r1",
                "gemini-2.0-flash": "google/gemini-2.0-flash-001",
                "gemini-1.5-flash": "google/gemini-flash-1.5",
                "gemini-3.6-flash": "google/gemini-2.0-flash-001",
            }
            return prefix_map.get(model, f"openai/{model}")

        return model

    def complete(
        self,
        *,
        system: str,
        messages: list[LlmMessage],
        intent: Intent = "generic",
        max_tokens: int | None = None,
        temperature: float = 0.2,
    ) -> LlmResponse:
        import time
        import httpx

        effective_max_tokens = max_tokens or self.max_tokens
        if self._is_groq and effective_max_tokens > 2048:
            effective_max_tokens = 2048

        payload = {
            "model": self.model,
            "max_tokens": effective_max_tokens,
            "temperature": temperature,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                *({"role": message.role, "content": message.content} for message in messages),
            ],
        }

        # Retry with exponential backoff on 429 rate-limit responses
        max_retries = 4
        wait_seconds = 15
        for attempt in range(max_retries + 1):
            try:
                response = self._client.post(f"{self._base_url}/chat/completions", json=payload)
            except httpx.HTTPError as exc:  # pragma: no cover - network failure path
                logger.warning("openai-compatible call failed: %s", exc)
                raise LlmError(f"LLM request failed: {exc}") from exc

            if response.status_code == 429 and attempt < max_retries:
                detail = _error_detail(response)
                logger.warning(
                    "Rate limited (429) on attempt %d/%d, retrying in %ds: %s",
                    attempt + 1, max_retries, wait_seconds, detail,
                )
                time.sleep(wait_seconds)
                wait_seconds = min(wait_seconds * 2, 120)  # cap at 2 minutes
                continue

            if response.status_code >= 400:
                detail = _error_detail(response)
                # Auto-fallback if the requested model doesn't exist on this provider
                if response.status_code == 404 and "model" in detail.lower() and attempt == 0:
                    fallback = self.GROQ_DEFAULT_MODEL if self._is_groq else self.OPENROUTER_DEFAULT_MODEL
                    if payload["model"] != fallback:
                        logger.warning(
                            "Model %s not found on provider. Falling back to %s (error: %s)",
                            payload["model"], fallback, detail,
                        )
                        payload["model"] = fallback
                        self.model = fallback
                        continue
                raise LlmError(f"LLM API error {response.status_code}: {detail}")

            break  # success

        try:
            data = response.json()
            choice = data["choices"][0]
            msg = choice["message"]
            text = msg.get("content") or msg.get("reasoning_content") or msg.get("reasoning") or ""
            # Some models return native tool calls instead of JSON in text
            tool_calls = msg.get("tool_calls")
            if not text.strip() and tool_calls:
                import json as _json
                calls = [
                    {
                        "tool": tc["function"]["name"],
                        "arguments": _json.loads(tc["function"]["arguments"])
                        if isinstance(tc["function"]["arguments"], str)
                        else tc["function"]["arguments"],
                    }
                    for tc in tool_calls
                    if tc.get("function")
                ]
                text = _json.dumps({"thought": "using tools", "tool_calls": calls})
                logger.info("Converted native tool_calls to JSON protocol: %s", text[:200])
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LlmError(f"Unexpected LLM response shape: {exc}") from exc

        usage = data.get("usage") or {}
        tokens = int(usage.get("total_tokens") or 0)

        if not text.strip():
            logger.error("LLM empty response. Full choice: %s", str(choice)[:500])
            raise LlmError("LLM returned an empty response")

        return LlmResponse(
            text=text,
            provider=self.name,
            model=self.model,
            tokens=tokens,
            meta={"intent": intent, "finish_reason": choice.get("finish_reason")},
        )


def _error_detail(response: httpx.Response) -> str:
    """Pull a human-readable message out of an error response body.

    OpenAI-compatible gateways nest it under ``error.message``; some (AgentRouter
    included) also set a top-level ``message``. Fall back to raw text.
    """
    try:
        body = response.json()
    except ValueError:
        return response.text[:300]
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if isinstance(error, str) and error:
            return error
        if body.get("message"):
            return str(body["message"])
    return str(body)[:300]
