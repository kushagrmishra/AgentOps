from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clerk_auth import ClerkIdentity
from app.db.base import new_id
from app.db.seed import deduplicate_seeds, seed_org_defaults
from app.models import Organization, OrgMembership, Subscription, User
from app.services.analytics import capture
from app.services.emails import send_welcome


def _map_role(clerk_org_role: str | None) -> str:
    if not clerk_org_role:
        return "owner"
    role = clerk_org_role.replace("org:", "").lower()
    if role in {"admin", "owner"}:
        return "owner" if role == "admin" else role
    if "admin" in role:
        return "admin"
    return "member"


def sync_identity(
    db: Session, identity: ClerkIdentity, requested_org_id: str | None = None
) -> tuple[User, Organization, OrgMembership]:
    """Upsert Clerk user + org + membership. Creates a personal org if none active."""
    email = identity.email or f"{identity.clerk_user_id}@users.clerk.dev"
    is_new_user = False
    user = db.scalar(select(User).where(User.clerk_user_id == identity.clerk_user_id))
    if user is None:
        # Migrate legacy email-matched row if present
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                id=new_id(),
                clerk_user_id=identity.clerk_user_id,
                email=email,
                display_name=identity.display_name,
                password_hash=None,
            )
            db.add(user)
            is_new_user = True
        else:
            user.clerk_user_id = identity.clerk_user_id
            if identity.display_name:
                user.display_name = identity.display_name
    else:
        if identity.display_name:
            user.display_name = identity.display_name
        user.email = email
    user.last_login_at = datetime.now(UTC)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        # Concurrent insert raced us — re-fetch the existing row.
        user = db.scalar(select(User).where(User.clerk_user_id == identity.clerk_user_id))
        assert user is not None
        if identity.display_name:
            user.display_name = identity.display_name
        user.email = email
        user.last_login_at = datetime.now(UTC)
        db.flush()

    org: Organization | None = None
    if requested_org_id:
        # Check if requested_org_id matches an existing Organization by id OR clerk_org_id
        org = db.scalar(
            select(Organization)
            .join(OrgMembership, OrgMembership.org_id == Organization.id)
            .where(
                OrgMembership.user_id == user.id,
                (Organization.id == requested_org_id) | (Organization.clerk_org_id == requested_org_id),
            )
        )
        if org is None:
            org = db.scalar(
                select(Organization).where(
                    (Organization.id == requested_org_id) | (Organization.clerk_org_id == requested_org_id)
                )
            )

    if org is None:
        if identity.clerk_org_id:
            org = db.scalar(select(Organization).where(Organization.clerk_org_id == identity.clerk_org_id))
            if org is None:
                org = Organization(
                    id=new_id(),
                    clerk_org_id=identity.clerk_org_id,
                    name=f"Org {identity.clerk_org_id[-6:]}",
                )
                db.add(org)
                try:
                    db.flush()
                except IntegrityError:
                    db.rollback()
                    org = db.scalar(select(Organization).where(Organization.clerk_org_id == identity.clerk_org_id))
                    assert org is not None
        else:
            # Personal workspace org (no Clerk org yet)
            membership = db.scalar(
                select(OrgMembership)
                .join(Organization)
                .where(OrgMembership.user_id == user.id, Organization.clerk_org_id.is_(None))
            )
            if membership:
                org = membership.organization
            else:
                org = Organization(id=new_id(), clerk_org_id=None, name=f"{user.display_name or 'Personal'} workspace")
                db.add(org)
                try:
                    db.flush()
                except IntegrityError:
                    db.rollback()
                    membership = db.scalar(
                        select(OrgMembership)
                        .join(Organization)
                        .where(OrgMembership.user_id == user.id, Organization.clerk_org_id.is_(None))
                    )
                    assert membership is not None
                    org = membership.organization

    assert org is not None
    membership = db.scalar(
        select(OrgMembership).where(OrgMembership.org_id == org.id, OrgMembership.user_id == user.id)
    )
    role = _map_role(identity.org_role) if identity.clerk_org_id else "owner"
    if membership is None:
        membership = OrgMembership(id=new_id(), org_id=org.id, user_id=user.id, role=role)
        db.add(membership)
    else:
        membership.role = role

    sub = db.scalar(select(Subscription).where(Subscription.org_id == org.id))
    if sub is None:
        db.add(Subscription(id=new_id(), org_id=org.id, plan="free", status="active"))

    db.commit()
    seed_org_defaults(db, org.id, user.id)
    db.refresh(user)
    db.refresh(org)
    db.refresh(membership)
    if is_new_user:
        send_welcome(user.email, user.display_name)
        capture("signup", user.id, {"org_id": org.id, "email": user.email})
    return user, org, membership
