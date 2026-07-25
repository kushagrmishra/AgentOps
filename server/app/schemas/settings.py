from __future__ import annotations

from pydantic import BaseModel, Field


class LlmSettingsOut(BaseModel):
    provider: str
    active_provider: str
    model: str
    has_api_key: bool
    # Masked hint only — the key itself never leaves the server.
    api_key_hint: str | None
    key_source: str
    available_models: list[str]


class LlmSettingsUpdate(BaseModel):
    model: str | None = Field(default=None, max_length=120)
    anthropic_api_key: str | None = Field(default=None, max_length=256)
    clear_api_key: bool = False
