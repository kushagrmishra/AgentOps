from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import AuthCtx, DbSession
from app.db.session import SessionLocal
from app.models import Run, Step
from app.schemas.runs import RunCreate, RunDetail, RunSummary, StepOut
from app.services import events
from app.services.analytics import capture
from app.services.billing import assert_can_create_run, assert_llm_ready, record_run_created
from app.services.orchestrator import submit_run
from app.services.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/runs", tags=["runs"])

TERMINAL_STATUSES = {"done", "failed"}


def _step_counts(db: Session, run_ids: list[str]) -> dict[str, tuple[int, int]]:
    if not run_ids:
        return {}
    rows = db.execute(
        select(
            Step.run_id,
            func.count(Step.id),
            func.sum(case((Step.status == "done", 1), else_=0)),
        )
        .where(Step.run_id.in_(run_ids))
        .group_by(Step.run_id)
    ).all()
    return {row[0]: (int(row[1] or 0), int(row[2] or 0)) for row in rows}


def _to_summary(run: Run, counts: tuple[int, int]) -> RunSummary:
    summary = RunSummary.model_validate(run)
    summary.step_count, summary.completed_step_count = counts
    return summary


def _to_detail(run: Run) -> RunDetail:
    detail = RunDetail.model_validate(run)
    detail.step_count = len(run.steps)
    detail.completed_step_count = sum(1 for step in run.steps if step.status == "done")
    return detail


def _get_org_run(db: Session, org_id: str, run_id: str, user_id: str | None = None) -> Run:
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    if run.org_id != org_id and (user_id is None or run.user_id != user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


@router.get("", response_model=list[RunSummary])
def list_runs(
    ctx: AuthCtx,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    source: Annotated[str | None, Query()] = None,
) -> list[RunSummary]:
    query = select(Run).where((Run.org_id == ctx.org.id) | (Run.user_id == ctx.user.id))
    if status_filter:
        query = query.where(Run.status == status_filter)
    if source:
        query = query.where(Run.source == source)
    runs = list(db.scalars(query.order_by(Run.created_at.desc()).limit(limit).offset(offset)).all())
    counts = _step_counts(db, [run.id for run in runs])
    return [_to_summary(run, counts.get(run.id, (0, 0))) for run in runs]


@router.post("", response_model=RunDetail, status_code=status.HTTP_201_CREATED)
def create_run(payload: RunCreate, ctx: AuthCtx, db: DbSession, request: Request) -> RunDetail:
    enforce_rate_limit(f"runs:{ctx.org.id}", limit=30, window_seconds=60)
    assert_can_create_run(db, ctx.org.id)
    assert_llm_ready(db, ctx.org.id, ctx.user)

    if payload.previous_run_id:
        old_run = db.get(Run, payload.previous_run_id)
        if old_run and (old_run.org_id == ctx.org.id or old_run.user_id == ctx.user.id):
            if old_run.status == "failed":
                db.delete(old_run)
                db.flush()

    selected_model = (
        payload.model.strip()
        if payload.model and payload.model.strip()
        else (ctx.user.llm_model or settings.llm_model)
    )
    if payload.model and payload.model.strip():
        ctx.user.llm_model = payload.model.strip()
        db.add(ctx.user)

    run = Run(
        org_id=ctx.org.id,
        user_id=ctx.user.id,
        goal=payload.goal.strip(),
        model=selected_model,
        status="planning",
        source="manual",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    record_run_created(db, ctx.org.id)
    capture("run_created", ctx.user.id, {"org_id": ctx.org.id, "run_id": run.id})
    events.bump(events.user_topic(ctx.org.id))
    submit_run(run.id)
    return _to_detail(run)


@router.get("/{run_id}", response_model=RunDetail)
def get_run(run_id: str, ctx: AuthCtx, db: DbSession) -> RunDetail:
    return _to_detail(_get_org_run(db, ctx.org.id, run_id, user_id=ctx.user.id))


@router.get("/{run_id}/steps", response_model=list[StepOut])
def list_steps(run_id: str, ctx: AuthCtx, db: DbSession) -> list[StepOut]:
    run = _get_org_run(db, ctx.org.id, run_id, user_id=ctx.user.id)
    return [StepOut.model_validate(step) for step in run.steps]


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(run_id: str, ctx: AuthCtx, db: DbSession) -> None:
    run = _get_org_run(db, ctx.org.id, run_id, user_id=ctx.user.id)
    db.delete(run)
    db.commit()
    events.bump(events.user_topic(ctx.org.id))


@router.get("/{run_id}/events")
async def stream_run_events(run_id: str, request: Request, ctx: AuthCtx) -> StreamingResponse:
    """SSE stream. Prefer 2s client polling for SaaS simplicity; SSE kept for live UX.
    WebSocket upgrade point: replace this endpoint with /ws/runs/{id} later.
    """

    def _load() -> RunDetail:
        with SessionLocal() as db:
            run = _get_org_run(db, ctx.org.id, run_id)
            return _to_detail(run)

    async def event_generator():
        topic = events.run_topic(run_id)
        version = -1
        while True:
            if await request.is_disconnected():
                break
            current = events.version(topic)
            if current != version:
                version = current
                detail = await run_in_threadpool(_load)
                yield f"data: {detail.model_dump_json()}\n\n"
                if detail.status in TERMINAL_STATUSES:
                    break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
