from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.plans import display_plan_name, is_paid_plan, limits_for
from app.db.base import new_id
from app.models import Subscription, UsagePeriod, User
from app.services.llm import resolve_api_key


def _period_key(now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    return f"{now.year:04d}-{now.month:02d}"


def get_or_create_subscription(db: Session, org_id: str) -> Subscription:
    sub = db.scalar(select(Subscription).where(Subscription.org_id == org_id))
    if sub is None:
        sub = Subscription(id=new_id(), org_id=org_id, plan="free", status="active")
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return sub


def get_or_create_usage(db: Session, org_id: str) -> UsagePeriod:
    key = _period_key()
    usage = db.scalar(
        select(UsagePeriod).where(UsagePeriod.org_id == org_id, UsagePeriod.period_start == key)
    )
    if usage is None:
        usage = UsagePeriod(id=new_id(), org_id=org_id, period_start=key, run_count=0, token_count=0)
        db.add(usage)
        db.commit()
        db.refresh(usage)
    return usage


def assert_can_create_run(db: Session, org_id: str) -> None:
    """In personal edition, run and token quotas are unlimited."""
    return


def assert_llm_ready(db: Session, org_id: str, user: User) -> None:
    """Ensure an API key is available (either from user profile or server environment)."""
    if settings.allows_mock_llm:
        return
    sub = get_or_create_subscription(db, org_id)
    key, source = resolve_api_key(user, sub.plan)
    if source != "none" and key:
        return
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "api_key_missing",
            "message": "No active LLM API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your server/.env or under the API tab.",
            "plan": sub.plan,
        },
    )


def record_run_created(db: Session, org_id: str) -> None:
    usage = get_or_create_usage(db, org_id)
    usage.run_count += 1
    db.commit()


def record_tokens(db: Session, org_id: str, tokens: int) -> None:
    if tokens <= 0:
        return
    usage = get_or_create_usage(db, org_id)
    usage.token_count += tokens
    db.commit()
