from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.crypto import encrypt_secret, mask_secret
from app.core.deps import AuthCtx, DbSession
from app.models import User
from app.schemas.settings import LlmSettingsOut, LlmSettingsUpdate
from app.services.llm import AVAILABLE_MODELS, active_provider_name, resolve_api_key, resolve_model

router = APIRouter(prefix="/settings", tags=["settings"])


def _to_out(user: User) -> LlmSettingsOut:
    _, key_source = resolve_api_key(user)
    return LlmSettingsOut(
        provider=settings.llm_provider,
        active_provider=active_provider_name(user),
        model=resolve_model(user),
        has_api_key=key_source != "none",
        api_key_hint=user.anthropic_key_hint if key_source == "account" else None,
        key_source=key_source,
        available_models=AVAILABLE_MODELS,
    )


@router.get("/llm", response_model=LlmSettingsOut)
def get_llm_settings(ctx: AuthCtx) -> LlmSettingsOut:
    """Provider config for the current account. The API key is never returned."""
    return _to_out(ctx.user)


@router.put("/llm", response_model=LlmSettingsOut)
def update_llm_settings(
    payload: LlmSettingsUpdate, ctx: AuthCtx, db: DbSession
) -> LlmSettingsOut:
    if payload.clear_api_key:
        ctx.user.anthropic_key_encrypted = None
        ctx.user.anthropic_key_hint = None
    elif payload.anthropic_api_key is not None:
        key = payload.anthropic_api_key.strip()
        if key:
            if not key.startswith("sk-"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Anthropic keys start with 'sk-'",
                )
            ctx.user.anthropic_key_encrypted = encrypt_secret(key)
            ctx.user.anthropic_key_hint = mask_secret(key)

    if payload.model is not None:
        model = payload.model.strip()
        ctx.user.llm_model = model or None

    db.commit()
    db.refresh(ctx.user)
    return _to_out(ctx.user)
