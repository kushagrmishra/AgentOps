from __future__ import annotations

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UtcDateTime, created_at_column, id_column


class User(Base):
    """App user mirrored from Clerk (identity lives in Clerk)."""

    __tablename__ = "users"

    id: Mapped[str] = id_column()
    clerk_user_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    # Nullable: Clerk-managed users have no local password.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    llm_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    anthropic_key_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    anthropic_key_hint: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = created_at_column()
    last_login_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
