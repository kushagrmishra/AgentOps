from __future__ import annotations

import logging

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.core.plans import is_paid_plan, normalize_plan
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

# Groq current models
GROQ_MODELS = [
    "openai/gpt-oss-20b",         # Default fast, reliable free-tier
    "openai/gpt-oss-120b",        # Deep reasoning
    "qwen/qwen3.6-27b",
    "qwen/qwen3.8-27b",
    "groq/compound",
    "groq/compound-mini",
]

# OpenRouter popular models
OPENROUTER_MODELS = [
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3.5-haiku",
    "google/gemini-2.0-flash-001",
    "google/gemini-flash-1.5",
    "deepseek/deepseek-chat",
    "deepseek/deepseek-r1",
    "meta-llama/llama-3.3-70b-instruct",
    "qwen/qwen-2.5-72b-instruct",
]

AVAILABLE_MODELS = [
    *GROQ_MODELS,
    *OPENROUTER_MODELS,
]

# Keep for backward compat
OPENAI_MODELS = AVAILABLE_MODELS


def models_for_active_provider() -> list[str]:
    """Model ids to offer in Settings based on active provider configuration."""
    base_url = settings.openai_base_url.lower()
    if "groq.com" in base_url:
        return GROQ_MODELS
    if "openrouter.ai" in base_url:
        return OPENROUTER_MODELS
    return AVAILABLE_MODELS


def _platform_api_key() -> str | None:
    """Server-side (platform) key for the active provider's env fallback."""
    if settings.llm_provider.lower() == "openai":
        return settings.openai_api_key
    return settings.anthropic_api_key


def resolve_api_key(user: User | None, plan: str | None = None) -> tuple[str | None, str]:
    """Resolve provider credentials based on the org plan.

    Free: customer must bring their own key (BYOK).
    Pro / Max: platform provides the server-side key.

    Returns the key and where it came from (`account` | `platform` | `none`).
    The key itself is never sent to the client. The per-account key is stored in
    ``anthropic_key_encrypted`` regardless of provider — the column name is
    historical; only one provider is active per deployment, so it is unambiguous.
    """
    if user and user.anthropic_key_encrypted:
        key = decrypt_secret(user.anthropic_key_encrypted)
        if key:
            return key, "account"
        logger.warning("stored provider key for user %s could not be decrypted", user.id)

    platform_key = _platform_api_key()
    if platform_key:
        return platform_key, "platform"

    return None, "none"


def resolve_model(user: User | None, override_model: str | None = None) -> str:
    if override_model and override_model.strip():
        return override_model.strip()
    return (user.llm_model if user and user.llm_model else None) or settings.llm_model


def get_provider(
    user: User | None = None,
    *,
    plan: str | None = None,
    model: str | None = None,
) -> LlmProvider:
    """Build the provider for this account and plan.

    Selected by ``LLM_PROVIDER``: ``anthropic`` (default) talks to the Anthropic
    Messages API; ``openai`` talks to any OpenAI-compatible Chat Completions host
    (``OPENAI_BASE_URL``, e.g. Groq or OpenRouter). The deterministic ``mock`` is available
    only when ENVIRONMENT is test/development (used by the pytest suite).
    """
    configured = settings.llm_provider.lower()
    selected_model = resolve_model(user, override_model=model)

    if configured == "mock":
        if not settings.allows_mock_llm:
            raise LlmError("LLM_PROVIDER=mock is disabled outside test/development")
        from app.services.llm.mock import MockProvider

        return MockProvider(model=selected_model, max_tokens=settings.llm_max_tokens)

    api_key, source = resolve_api_key(user, plan)
    if not api_key:
        plan_id = normalize_plan(plan)
        provider_label = "OpenAI-compatible" if configured == "openai" else "Anthropic"
        if is_paid_plan(plan_id):
            env_var = "OPENAI_API_KEY" if configured == "openai" else "ANTHROPIC_API_KEY"
            raise LlmError(
                f"Platform {provider_label} API key is not configured for Pro/Max. "
                f"Set {env_var} on the server."
            )
        raise LlmError(
            f"Free plan requires your own {provider_label} API key. "
            "Add it under API in the dashboard."
        )

    if configured == "openai":
        from app.services.llm.openai_provider import OpenAICompatibleProvider

        # Auto-detect OpenRouter or Groq from user's custom API key prefix if provided
        base_url = settings.openai_base_url
        if api_key.startswith("sk-or-"):
            base_url = "https://openrouter.ai/api/v1"
        elif api_key.startswith("gsk_"):
            base_url = "https://api.groq.com/openai/v1"

        try:
            return OpenAICompatibleProvider(
                api_key=api_key,
                base_url=base_url,
                model=selected_model,
                max_tokens=settings.llm_max_tokens,
            )
        except Exception as exc:
            logger.exception("failed to initialise OpenAI-compatible provider (source=%s)", source)
            raise LlmError(f"Failed to initialise OpenAI-compatible provider: {exc}") from exc

    from app.services.llm.anthropic_provider import AnthropicProvider

    try:
        return AnthropicProvider(
            api_key=api_key, model=selected_model, max_tokens=settings.llm_max_tokens
        )
    except Exception as exc:
        logger.exception("failed to initialise Anthropic provider (source=%s)", source)
        raise LlmError(f"Failed to initialise Anthropic provider: {exc}") from exc


def active_provider_name(user: User | None = None, *, plan: str | None = None) -> str:
    configured = settings.llm_provider.lower()
    if configured == "mock" and settings.allows_mock_llm:
        return "mock"
    api_key, _ = resolve_api_key(user, plan)
    if not api_key:
        return "none"
    return "openai" if configured == "openai" else "anthropic"


__all__ = [
    "AVAILABLE_MODELS",
    "OPENAI_MODELS",
    "Intent",
    "LlmError",
    "LlmMessage",
    "LlmProvider",
    "LlmResponse",
    "MockProvider",
    "active_provider_name",
    "extract_json_object",
    "get_provider",
    "models_for_active_provider",
    "resolve_api_key",
    "resolve_model",
]
