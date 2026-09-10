from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, created_at_column, id_column


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = id_column()
    clerk_org_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = created_at_column()

    memberships: Mapped[list["OrgMembership"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan", lazy="selectin"
    )


class OrgMembership(Base):
    __tablename__ = "org_memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_org_user"),)

    id: Mapped[str] = id_column()
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")  # owner|admin|member
    created_at: Mapped[datetime] = created_at_column()

    organization: Mapped[Organization] = relationship(back_populates="memberships")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = id_column()
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    plan: Mapped[str] = mapped_column(String(40), nullable=False, default="free")  # free|pro|max|team|enterprise
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="active")
    current_period_end: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = created_at_column()


class UsagePeriod(Base):
    __tablename__ = "usage_periods"
    __table_args__ = (UniqueConstraint("org_id", "period_start", name="uq_org_period"),)

    id: Mapped[str] = id_column()
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    period_start: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    run_count: Mapped[int] = mapped_column(nullable=False, default=0)
    token_count: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = created_at_column()
