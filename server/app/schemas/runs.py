from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.config import MAX_GOAL_LENGTH


class RunCreate(BaseModel):
    goal: str = Field(min_length=8, max_length=MAX_GOAL_LENGTH)
    model: str | None = None
    previous_run_id: str | None = None


class ToolCallOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tool_name: str
    arguments: dict
    result: str | None
    status: str
    error: str | None
    duration_ms: int
    created_at: datetime


class StepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    index: int
    title: str
    instruction: str
    agent_id: str | None
    agent_name: str
    status: str
    output: str | None
    error: str | None
    tokens: int
    started_at: datetime | None
    completed_at: datetime | None
    tool_calls: list[ToolCallOut] = Field(default_factory=list)


class RunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    goal: str
    status: str
    source: str
    provider: str | None
    model: str | None
    total_tokens: int
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    step_count: int = 0
    completed_step_count: int = 0


class RunDetail(RunSummary):
    planner_summary: str | None
    final_output: str | None
    error: str | None
    steps: list[StepOut] = Field(default_factory=list)
