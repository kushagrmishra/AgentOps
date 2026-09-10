from __future__ import annotations

import json
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = SERVER_ROOT.parent
CONTRACT_PATH = REPO_ROOT / "shared" / "contract.json"
DEFAULT_WORKSPACE = SERVER_ROOT / "workspace"

_INSECURE_JWT = "dev-only-insecure-secret-change-me"


def normalize_database_url(url: str) -> str:
    cleaned = url.strip()
    if cleaned.startswith("postgres://"):
        cleaned = "postgresql+psycopg://" + cleaned[len("postgres://") :]
    elif cleaned.startswith("postgresql://") and "+psycopg" not in cleaned.split("://", 1)[0]:
        cleaned = "postgresql+psycopg://" + cleaned[len("postgresql://") :]
    host = cleaned.split("@")[-1].lower() if "@" in cleaned else ""
    if ("supabase.co" in host or "pooler.supabase.com" in host) and "sslmode=" not in cleaned:
        cleaned = f"{cleaned}{'&' if '?' in cleaned else '?'}sslmode=require"
    return cleaned


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=SERVER_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "AgentOps"
    environment: str = "development"
    api_prefix: str = "/api"

    database_url: str = f"sqlite:///{SERVER_ROOT / 'agentops.db'}"

    # Legacy local JWT (tests / migration only). Primary auth is Clerk.
    jwt_secret: str = _INSECURE_JWT
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # Clerk
    clerk_secret_key: str | None = None
    clerk_publishable_key: str | None = None
    clerk_jwt_key: str | None = None  # PEM public key (optional, networkless)
    clerk_jwks_url: str | None = None

    # LLM
    llm_provider: str = "anthropic"  # anthropic | openai | mock
    llm_model: str = "claude-sonnet-4-5-20250929"
    llm_max_tokens: int = 2048
    anthropic_api_key: str | None = None
    # OpenAI-compatible provider (OpenAI, AgentRouter, OpenRouter, Groq, local, …).
    # Active when LLM_PROVIDER=openai; point OPENAI_BASE_URL at the gateway.
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    mock_latency_ms: int = 0

    # Stripe
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_pro: str | None = None
    stripe_price_max: str | None = None
    stripe_price_team: str | None = None

    # Upstash Redis
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: str | None = None

    # E2B
    e2b_api_key: str | None = None

    # Resend
    resend_api_key: str | None = None
    email_from: str = "AgentOps <onboarding@agentops.dev>"

    # Sentry / PostHog (server-side)
    sentry_dsn: str | None = None
    posthog_api_key: str | None = None
    posthog_host: str = "https://us.i.posthog.com"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174"
    client_origin: str = "http://localhost:5173"
    marketing_origin: str = "http://localhost:5174"

    static_dir: str | None = None
    workspace_root: str = str(DEFAULT_WORKSPACE)
    seed_on_startup: bool = True

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_db(cls, value: object) -> object:
        if isinstance(value, str) and value.strip():
            return normalize_database_url(value)
        return value

    @field_validator("llm_provider", mode="before")
    @classmethod
    def _normalize_provider(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @model_validator(mode="after")
    def _derive_jwks_and_guard_prod(self) -> Settings:
        if not self.clerk_jwks_url and self.clerk_publishable_key:
            # pk_test_XXXX → Frontend API host is in Clerk dashboard; allow explicit JWKS URL.
            pass
        env = (self.environment or "development").lower()
        if env == "production":
            if self.is_sqlite:
                raise ValueError("PRODUCTION requires Postgres (Supabase DATABASE_URL)")
            if not self.clerk_secret_key:
                raise ValueError("PRODUCTION requires CLERK_SECRET_KEY")
            # Require the platform key for whichever provider is active.
            if self.llm_provider == "openai":
                if not self.openai_api_key:
                    raise ValueError("PRODUCTION with LLM_PROVIDER=openai requires OPENAI_API_KEY")
            elif not self.anthropic_api_key:
                raise ValueError("PRODUCTION requires ANTHROPIC_API_KEY")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        # Production: lock CORS to the authenticated app origin only.
        if self.environment.lower() == "production":
            return [self.client_origin.strip()] if self.client_origin.strip() else []
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def static_dir_path(self) -> Path | None:
        if not self.static_dir:
            return None
        path = Path(self.static_dir)
        return path if path.is_dir() else None

    @property
    def workspace_path(self) -> Path:
        path = Path(self.workspace_root).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def allows_mock_llm(self) -> bool:
        return self.environment.lower() in {"test", "development"} and self.llm_provider == "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_contract() -> dict:
    with CONTRACT_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


settings = get_settings()
contract = get_contract()

TOOL_CONTRACT: list[dict] = contract["tools"]
TOOL_NAMES: list[str] = [tool["name"] for tool in TOOL_CONTRACT]
MAX_STEPS_PER_RUN: int = contract["limits"]["maxStepsPerRun"]
MAX_TOOL_CALLS_PER_STEP: int = contract["limits"]["maxToolCallsPerStep"]
MAX_GOAL_LENGTH: int = contract["limits"]["maxGoalLength"]


def new_jwt_secret() -> str:
    return secrets.token_urlsafe(48)
