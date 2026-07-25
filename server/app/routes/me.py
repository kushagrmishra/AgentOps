from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import AuthCtx, DbSession
from app.core.plans import limits_for
from app.models import OrgMembership, Organization, Subscription, UsagePeriod
from app.services.billing import get_or_create_subscription, get_or_create_usage

router = APIRouter(tags=["me"])


class MembershipOut(BaseModel):
    org_id: str
    org_name: str
    role: str
    clerk_org_id: str | None


class MeOut(BaseModel):
    id: str
    email: str
    display_name: str | None
    clerk_user_id: str | None
    active_org_id: str
    active_org_name: str
    role: str
    memberships: list[MembershipOut]
    plan: str
    usage_runs: int
    usage_tokens: int
    limit_runs: int
    limit_tokens: int


@router.get("/me", response_model=MeOut)
def me(ctx: AuthCtx, db: DbSession) -> MeOut:
    rows = db.execute(
        select(OrgMembership, Organization)
        .join(Organization, Organization.id == OrgMembership.org_id)
        .where(OrgMembership.user_id == ctx.user.id)
    ).all()
    memberships = [
        MembershipOut(
            org_id=org.id,
            org_name=org.name,
            role=mem.role,
            clerk_org_id=org.clerk_org_id,
        )
        for mem, org in rows
    ]
    sub = get_or_create_subscription(db, ctx.org.id)
    usage = get_or_create_usage(db, ctx.org.id)
    limits = limits_for(sub.plan)
    return MeOut(
        id=ctx.user.id,
        email=ctx.user.email,
        display_name=ctx.user.display_name,
        clerk_user_id=ctx.user.clerk_user_id,
        active_org_id=ctx.org.id,
        active_org_name=ctx.org.name,
        role=ctx.membership.role,
        memberships=memberships,
        plan=sub.plan,
        usage_runs=usage.run_count,
        usage_tokens=usage.token_count,
        limit_runs=limits["runs_per_month"],
        limit_tokens=limits["tokens_per_month"],
    )


@router.post("/orgs/sync", response_model=MeOut)
def sync_org(ctx: AuthCtx, db: DbSession) -> MeOut:
    """Explicit sync endpoint (also happens implicitly on every auth'd request)."""
    return me(ctx, db)
