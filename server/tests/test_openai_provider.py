"""Unit tests for the OpenAI-compatible provider.

Hermetic: a stubbed httpx transport stands in for the network, so no API key and
no live host are needed. The request/response shapes asserted here match what was
verified directly against the live AgentRouter endpoint
(POST https://agentrouter.org/v1/chat/completions, Bearer auth, OpenAI schema).
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.services.llm.base import LlmError, LlmMessage
from app.services.llm.openai_provider import OpenAICompatibleProvider


def _provider_with(monkeypatch, handler) -> OpenAICompatibleProvider:
    """Build a provider whose internal httpx.Client routes through `handler`."""
    real_client = httpx.Client

    def factory(*args, **kwargs):
        kwargs.setdefault("transport", httpx.MockTransport(handler))
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", factory)
    return OpenAICompatibleProvider(
        api_key="test-key",
        base_url="https://agentrouter.org/v1",
        model="claude-opus-4-8",
        max_tokens=123,
    )


def test_complete_sends_expected_request_and_parses_response(monkeypatch):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "hello world"}, "finish_reason": "stop"}],
                "usage": {"total_tokens": 42},
            },
        )

    provider = _provider_with(monkeypatch, handler)
    result = provider.complete(
        system="You are helpful.",
        messages=[LlmMessage(role="user", content="hi")],
        temperature=0.5,
    )

    request = captured["request"]
    assert request.method == "POST"
    # base_url's /v1 prefix must be preserved (the httpx-join footgun this avoids).
    assert str(request.url) == "https://agentrouter.org/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer test-key"

    body = captured["body"]
    assert body["model"] == "claude-opus-4-8"
    assert body["max_tokens"] == 123
    assert body["temperature"] == 0.5
    # System prompt is prepended as the first message.
    assert body["messages"][0] == {"role": "system", "content": "You are helpful."}
    assert body["messages"][1] == {"role": "user", "content": "hi"}

    assert result.text == "hello world"
    assert result.provider == "openai"
    assert result.model == "claude-opus-4-8"
    assert result.tokens == 42
    assert result.meta["finish_reason"] == "stop"


def test_per_call_max_tokens_overrides_default(monkeypatch):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 1}},
        )

    provider = _provider_with(monkeypatch, handler)
    provider.complete(system="s", messages=[LlmMessage(role="user", content="q")], max_tokens=7)
    assert captured["body"]["max_tokens"] == 7


def test_http_error_surfaces_server_message(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={
                "error": {"message": "unauthorized client detected"},
                "message": "UNAUTHENTICATED",
                "success": False,
            },
        )

    provider = _provider_with(monkeypatch, handler)
    with pytest.raises(LlmError) as excinfo:
        provider.complete(system="s", messages=[LlmMessage(role="user", content="q")])
    message = str(excinfo.value)
    assert "401" in message
    assert "unauthorized client detected" in message


def test_empty_content_is_an_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "   "}}], "usage": {"total_tokens": 0}},
        )

    provider = _provider_with(monkeypatch, handler)
    with pytest.raises(LlmError):
        provider.complete(system="s", messages=[LlmMessage(role="user", content="q")])


def test_malformed_response_shape_is_an_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": True})

    provider = _provider_with(monkeypatch, handler)
    with pytest.raises(LlmError):
        provider.complete(system="s", messages=[LlmMessage(role="user", content="q")])


def test_complete_json_round_trips_through_the_provider(monkeypatch):
    """complete_json lives on the base class; confirm it works over this provider."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": '```json\n{"plan": ["a", "b"]}\n```'}}],
                "usage": {"total_tokens": 5},
            },
        )

    provider = _provider_with(monkeypatch, handler)
    obj, response = provider.complete_json(system="s", messages=[LlmMessage(role="user", content="q")])
    assert obj == {"plan": ["a", "b"]}
    assert response.tokens == 5
