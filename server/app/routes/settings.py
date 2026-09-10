from __future__ import annotations

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.crypto import encrypt_secret, mask_secret
from app.core.deps import AuthCtx, DbSession
from app.core.plans import display_plan_name, is_paid_plan
from app.models import User
from app.schemas.settings import LlmSettingsOut, LlmSettingsUpdate
from app.services.billing import get_or_create_subscription
from app.services.llm import (
    active_provider_name,
    models_for_active_provider,
    resolve_api_key,
    resolve_model,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def _to_out(user: User, plan: str) -> LlmSettingsOut:
    _, key_source = resolve_api_key(user, plan)
    paid = is_paid_plan(plan)
    return LlmSettingsOut(
        provider=settings.llm_provider,
        active_provider=active_provider_name(user, plan=plan),
        model=resolve_model(user),
        has_api_key=key_source != "none",
        api_key_hint=user.anthropic_key_hint if key_source == "account" else None,
        key_source=key_source,
        available_models=models_for_active_provider(),
        plan=plan,
        plan_display=display_plan_name(plan),
        requires_byok=not paid,
        platform_key_included=paid,
    )


@router.get("/llm", response_model=LlmSettingsOut)
def get_llm_settings(ctx: AuthCtx, db: DbSession) -> LlmSettingsOut:
    """Provider config for the current account. The API key is never returned."""
    sub = get_or_create_subscription(db, ctx.org.id)
    return _to_out(ctx.user, sub.plan)


@router.put("/llm", response_model=LlmSettingsOut)
def update_llm_settings(
    payload: LlmSettingsUpdate, ctx: AuthCtx, db: DbSession
) -> LlmSettingsOut:
    sub = get_or_create_subscription(db, ctx.org.id)
    # Allow all plans to update/clear custom API keys to support BYOK override.

    if payload.clear_api_key:
        ctx.user.anthropic_key_encrypted = None
        ctx.user.anthropic_key_hint = None
    elif payload.anthropic_api_key is not None:
        key = payload.anthropic_api_key.strip()
        if key:
            if not (key.startswith("sk-") or key.startswith("gsk_") or key.startswith("AIza")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="API key must start with a valid provider prefix ('gsk_' for Groq, 'sk-or-' for OpenRouter, 'sk-ant-' for Anthropic, 'sk-' for OpenAI)",
                )
            if len(key) < 8:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid API key length",
                )
            ctx.user.anthropic_key_encrypted = encrypt_secret(key)
            ctx.user.anthropic_key_hint = mask_secret(key)

    if payload.model is not None:
        model = payload.model.strip()
        ctx.user.llm_model = model or None

    db.commit()
    db.refresh(ctx.user)
    return _to_out(ctx.user, sub.plan)
