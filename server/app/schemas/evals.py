from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.config import MAX_GOAL_LENGTH


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    goal: str = Field(min_length=8, max_length=MAX_GOAL_LENGTH)
    expected_outcome: str = Field(min_length=4, max_length=4000)
    is_active: bool = True


class ScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    goal: str | None = Field(default=None, min_length=8, max_length=MAX_GOAL_LENGTH)
    expected_outcome: str | None = Field(default=None, min_length=4, max_length=4000)
    is_active: bool | None = None


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    goal: str
    expected_outcome: str
    is_active: bool
    is_seed: bool
    created_at: datetime


class EvalRunStart(BaseModel):
    # Empty means "every active scenario".
    scenario_ids: list[str] = Field(default_factory=list)


class EvalResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str | None
    scenario_name: str
    run_id: str | None
    score: float
    passed: bool
    judge_reasoning: str | None
    actual_output: str | None
    error: str | None
    duration_ms: int
    created_at: datetime


class EvalRunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    total: int
    passed: int
    failed: int
    avg_score: float
    error: str | None
    created_at: datetime
    completed_at: datetime | None


class EvalRunDetail(EvalRunSummary):
    results: list[EvalResultOut] = Field(default_factory=list)
