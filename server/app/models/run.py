from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JsonColumn, UtcDateTime, created_at_column, id_column


class Run(Base):
    """One goal submitted to the orchestrator."""

    __tablename__ = "runs"

    id: Mapped[str] = id_column()
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    goal: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planning", index=True)
    # "manual" for dashboard submissions, "eval" for harness replays.
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual", index=True)

    planner_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = created_at_column()
    started_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)

    steps: Mapped[list["Step"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="Step.index",
        lazy="selectin",
    )


class Step(Base):
    """A planner-produced subtask, executed by exactly one sub-agent."""

    __tablename__ = "steps"

    id: Mapped[str] = id_column()
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    index: Mapped[int] = mapped_column(Integer, nullable=False)

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    instruction: Mapped[str] = mapped_column(Text, nullable=False, default="")

    agent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("agent_definitions.id", ondelete="SET NULL"), nullable=True
    )
    # Snapshot so history stays readable after an agent is renamed or deleted.
    agent_name: Mapped[str] = mapped_column(String(80), nullable=False, default="unassigned")

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = created_at_column()
    started_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)

    run: Mapped[Run] = relationship(back_populates="steps")
    tool_calls: Mapped[list["ToolCall"]] = relationship(
        back_populates="step",
        cascade="all, delete-orphan",
        order_by="ToolCall.created_at",
        lazy="selectin",
    )


class ToolCall(Base):
    """Audit log of every tool invocation a sub-agent made."""

    __tablename__ = "tool_calls"

    id: Mapped[str] = id_column()
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    step_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("steps.id", ondelete="CASCADE"), index=True, nullable=False
    )

    tool_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    arguments: Mapped[dict] = mapped_column(JsonColumn, nullable=False, default=dict)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ok")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = created_at_column()

    step: Mapped[Step] = relationship(back_populates="tool_calls")
