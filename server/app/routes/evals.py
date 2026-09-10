from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import AuthCtx, DbSession
from app.db.session import SessionLocal
from app.models import EvalRun, EvalScenario
from app.schemas.evals import (
    EvalRunDetail,
    EvalRunStart,
    EvalRunSummary,
    ScenarioCreate,
    ScenarioOut,
    ScenarioUpdate,
)
from app.db.base import utcnow
from app.services import events
from app.services.billing import assert_llm_ready
from app.services.evals import submit_eval_run

router = APIRouter(prefix="/evals", tags=["evals"])


def _get_owned_scenario(db: Session, org_id: str, scenario_id: str) -> EvalScenario:
    scenario = db.get(EvalScenario, scenario_id)
    if scenario is None or scenario.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    return scenario


def _get_owned_eval_run(db: Session, org_id: str, eval_run_id: str) -> EvalRun:
    eval_run = db.get(EvalRun, eval_run_id)
    if eval_run is None or eval_run.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval run not found")
    return eval_run


# ------------------------------------------------------------------- scenarios


@router.get("/scenarios", response_model=list[ScenarioOut])
def list_scenarios(ctx: AuthCtx, db: DbSession) -> list[EvalScenario]:
    return list(
        db.scalars(
            select(EvalScenario)
            .where(EvalScenario.org_id == ctx.org.id)
            .order_by(EvalScenario.created_at)
        ).all()
    )


@router.post("/scenarios", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
def create_scenario(payload: ScenarioCreate, ctx: AuthCtx, db: DbSession) -> EvalScenario:
    scenario = EvalScenario(
        org_id=ctx.org.id, user_id=ctx.user.id,
        name=payload.name.strip(),
        goal=payload.goal.strip(),
        expected_outcome=payload.expected_outcome.strip(),
        is_active=payload.is_active,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.patch("/scenarios/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: str, payload: ScenarioUpdate, ctx: AuthCtx, db: DbSession
) -> EvalScenario:
    scenario = _get_owned_scenario(db, ctx.org.id, scenario_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(scenario, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(scenario_id: str, ctx: AuthCtx, db: DbSession) -> None:
    scenario = _get_owned_scenario(db, ctx.org.id, scenario_id)
    db.delete(scenario)
    db.commit()


# ------------------------------------------------------------------- eval runs


@router.get("/runs", response_model=list[EvalRunSummary])
def list_eval_runs(
    ctx: AuthCtx,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[EvalRun]:
    return list(
        db.scalars(
            select(EvalRun)
            .where(EvalRun.org_id == ctx.org.id)
            .order_by(EvalRun.created_at.desc())
            .limit(limit)
        ).all()
    )


@router.post("/runs", response_model=EvalRunDetail, status_code=status.HTTP_202_ACCEPTED)
def start_eval_run(payload: EvalRunStart, ctx: AuthCtx, db: DbSession) -> EvalRun:
    """Kick off the harness over the selected scenarios (default: all active)."""
    assert_llm_ready(db, ctx.org.id, ctx.user)
    query = select(EvalScenario.id).where(
        EvalScenario.org_id == ctx.org.id, EvalScenario.is_active.is_(True)
    )
    if payload.scenario_ids:
        query = query.where(EvalScenario.id.in_(payload.scenario_ids))
    if not db.scalars(query).all():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active scenarios to evaluate. Add a scenario first.",
        )

    eval_run = EvalRun(org_id=ctx.org.id, user_id=ctx.user.id, status="running")
    db.add(eval_run)
    db.commit()
    db.refresh(eval_run)

    submit_eval_run(eval_run.id, payload.scenario_ids or None)
    return eval_run


@router.get("/runs/{eval_run_id}", response_model=EvalRunDetail)
def get_eval_run(eval_run_id: str, ctx: AuthCtx, db: DbSession) -> EvalRun:
    return _get_owned_eval_run(db, ctx.org.id, eval_run_id)


@router.post("/runs/{eval_run_id}/terminate", response_model=EvalRunDetail)
def terminate_eval_run(eval_run_id: str, ctx: AuthCtx, db: DbSession) -> EvalRun:
    eval_run = _get_owned_eval_run(db, ctx.org.id, eval_run_id)
    if eval_run.status == "running":
        eval_run.status = "failed"
        eval_run.error = "Terminated by user"
        eval_run.completed_at = utcnow()
        db.commit()
        db.refresh(eval_run)
        events.bump(events.eval_topic(eval_run_id))
    return eval_run


@router.get("/runs/{eval_run_id}/events")
async def stream_eval_run(
    eval_run_id: str, request: Request, ctx: AuthCtx
) -> StreamingResponse:
    def load() -> str:
        with SessionLocal() as db:
            eval_run = _get_owned_eval_run(db, ctx.org.id, eval_run_id)
            return EvalRunDetail.model_validate(eval_run).model_dump_json()

    async def event_stream():
        topic = events.eval_topic(eval_run_id)
        last_version = -1
        heartbeat_ticks = 0

        while True:
            if await request.is_disconnected():
                break

            current_version = events.version(topic)
            if current_version != last_version:
                last_version = current_version
                heartbeat_ticks = 0
                try:
                    payload = await run_in_threadpool(load)
                except HTTPException:
                    yield f"event: error\ndata: {json.dumps({'detail': 'Eval run not found'})}\n\n"
                    break
                yield f"event: eval\ndata: {payload}\n\n"
                if json.loads(payload)["status"] in {"done", "failed"}:
                    yield "event: done\ndata: {}\n\n"
                    break
            else:
                heartbeat_ticks += 1
                if heartbeat_ticks >= 50:
                    heartbeat_ticks = 0
                    yield ": keepalive\n\n"

            await asyncio.sleep(0.3)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
