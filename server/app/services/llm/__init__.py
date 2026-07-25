from __future__ import annotations

import logging

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.models.user import User
from app.services.llm.mock import MockProvider
from app.services.llm.base import (
    Intent,
    LlmError,
    LlmMessage,
    LlmProvider,
    LlmResponse,
    extract_json_object,
)

logger = logging.getLogger(__name__)

# Offered in Settings; the model string is passed straight through to the provider.
AVAILABLE_MODELS = [
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-1-20250805",
    "claude-3-5-haiku-20241022",
]


def resolve_api_key(user: User | None) -> tuple[str | None, str]:
    """Per-account key wins over the server-wide env key.

    Returns the key and where it came from, never sending either to the client.
    """
    if user and user.anthropic_key_encrypted:
        key = decrypt_secret(user.anthropic_key_encrypted)
        if key:
            return key, "account"
        logger.warning("stored provider key for user %s could not be decrypted", user.id)
    if settings.anthropic_api_key:
        return settings.anthropic_api_key, "environment"
    return None, "none"


def resolve_model(user: User | None) -> str:
    return (user.llm_model if user and user.llm_model else None) or settings.llm_model


def get_provider(user: User | None = None) -> LlmProvider:
    """Build the provider for this account.

    Production and normal runtime use Anthropic only. The deterministic mock is
    available solely when ENVIRONMENT is test/development and LLM_PROVIDER=mock
    (used by the pytest suite).
    """
    configured = settings.llm_provider.lower()
    model = resolve_model(user)

    if configured == "mock":
        if not settings.allows_mock_llm:
            raise LlmError("LLM_PROVIDER=mock is disabled outside test/development")
        from app.services.llm.mock import MockProvider

        return MockProvider(max_tokens=settings.llm_max_tokens)

    api_key, source = resolve_api_key(user)
    if not api_key:
        raise LlmError(
            "No Anthropic API key configured. Set ANTHROPIC_API_KEY on the server "
            "or paste a key in Settings. Mock LLM is disabled."
        )

    from app.services.llm.anthropic_provider import AnthropicProvider

    try:
        return AnthropicProvider(
            api_key=api_key, model=model, max_tokens=settings.llm_max_tokens
        )
    except Exception as exc:
        logger.exception("failed to initialise Anthropic provider (source=%s)", source)
        raise LlmError(f"Failed to initialise Anthropic provider: {exc}") from exc


def active_provider_name(user: User | None = None) -> str:
    configured = settings.llm_provider.lower()
    if configured == "mock" and settings.allows_mock_llm:
        return "mock"
    api_key, _ = resolve_api_key(user)
    return "anthropic" if api_key else "none"


__all__ = [
    "AVAILABLE_MODELS",
    "Intent",
    "LlmError",
    "LlmMessage",
    "LlmProvider",
    "LlmResponse",
    "MockProvider",
    "active_provider_name",
    "extract_json_object",
    "get_provider",
    "resolve_api_key",
    "resolve_model",
]
