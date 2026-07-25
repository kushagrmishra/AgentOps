from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UtcDateTime, created_at_column, id_column

# Scores at or above this threshold count as a pass.
PASS_THRESHOLD = 0.7


class EvalScenario(Base):
    """A goal plus the outcome a healthy pipeline should produce."""

    __tablename__ = "eval_scenarios"

    id: Mapped[str] = id_column()
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    expected_outcome: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_seed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = created_at_column()


class EvalRun(Base):
    """One execution of the harness over a set of scenarios."""

    __tablename__ = "eval_runs"

    id: Mapped[str] = id_column()
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running", index=True)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    passed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = created_at_column()
    completed_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)

    results: Mapped[list["EvalResult"]] = relationship(
        back_populates="eval_run",
        cascade="all, delete-orphan",
        order_by="EvalResult.created_at",
        lazy="selectin",
    )


class EvalResult(Base):
    """Score for a single scenario within an eval run."""

    __tablename__ = "eval_results"

    id: Mapped[str] = id_column()
    eval_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("eval_runs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    scenario_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("eval_scenarios.id", ondelete="SET NULL"), nullable=True
    )
    run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True
    )

    scenario_name: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    judge_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = created_at_column()

    eval_run: Mapped[EvalRun] = relationship(back_populates="results")
