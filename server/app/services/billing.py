from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.plans import limits_for
from app.db.base import new_id
from app.models import Subscription, UsagePeriod


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
    sub = get_or_create_subscription(db, org_id)
    usage = get_or_create_usage(db, org_id)
    limits = limits_for(sub.plan)
    if usage.run_count >= limits["runs_per_month"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "plan_limit_runs",
                "message": f"Monthly run quota ({limits['runs_per_month']}) reached for plan '{sub.plan}'. Upgrade to continue.",
                "plan": sub.plan,
                "upgrade_required": True,
            },
        )
    if usage.token_count >= limits["tokens_per_month"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "plan_limit_tokens",
                "message": f"Monthly token quota ({limits['tokens_per_month']}) reached for plan '{sub.plan}'. Upgrade to continue.",
                "plan": sub.plan,
                "upgrade_required": True,
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
