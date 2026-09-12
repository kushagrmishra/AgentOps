from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models import AgentDefinition, Run, Step, ToolCall, User
from app.services import events
from app.services.billing import get_or_create_subscription, record_tokens
from app.services.agent_runner import AgentRunError, run_step
from app.services.llm import get_provider
from app.services.planner import AgentSpec, PlannerError, create_plan
from app.services.tools import ToolOutcome
from app.services.worker import WorkerPool

logger = logging.getLogger(__name__)

# A small pool keeps the API responsive without letting a burst of submissions
# exhaust DB connections.
_pool = WorkerPool(max_workers=4, thread_name_prefix="agentops-run")


def submit_run(run_id: str) -> None:
    """Queue a run for background execution."""
    _pool.submit(_execute_run_safe, run_id)


def shutdown_executor() -> None:
    _pool.shutdown()


def load_agent_specs(db: Session, org_id: str) -> list[AgentSpec]:
    rows = db.scalars(
        select(AgentDefinition)
        .where(AgentDefinition.org_id == org_id, AgentDefinition.is_active.is_(True))
        .order_by(AgentDefinition.created_at)
    ).all()
    return [AgentSpec.from_model(row) for row in rows]


def _execute_run_safe(run_id: str) -> None:
    try:
        with SessionLocal() as db:
            execute_run(db, run_id)
    except Exception:  # pragma: no cover - worker guard
        with SessionLocal() as check_db:
            if not check_db.get(Run, run_id):
                return
        logger.exception("run %s crashed", run_id)
        _mark_failed(run_id, "internal error while executing the run")


def _mark_failed(run_id: str, message: str) -> None:
    try:
        with SessionLocal() as db:
            run = db.get(Run, run_id)
            if run and run.status not in {"done", "failed"}:
                run.status = "failed"
                run.error = message
                run.completed_at = utcnow()
                db.commit()
                events.bump(events.run_topic(run_id))
                events.bump(events.user_topic(run.org_id))
                record_tokens(db, run.org_id, run.total_tokens or 0)
    except Exception:  # pragma: no cover - last resort
        logger.exception("could not mark run %s as failed", run_id)


def execute_run(db: Session, run_id: str) -> Run:
    """Plan the goal, then execute each subtask in order.

    Every state transition is committed immediately so the run detail view can
    stream progress while the pipeline is still working.
    """
    run = db.get(Run, run_id)
    if run is None:
        raise ValueError(f"run {run_id} not found")

    user = db.get(User, run.user_id)
    sub = get_or_create_subscription(db, run.org_id)
    provider = get_provider(user, plan=sub.plan, model=run.model)

    run.status = "planning"
    run.started_at = utcnow()
    run.provider = provider.name
    run.model = provider.model
    db.commit()
    _notify(run)

    agents = load_agent_specs(db, run.org_id)

    try:
        plan = create_plan(run.goal, agents, provider)
    except PlannerError as exc:
        logger.warning("planning failed for run %s: %s", run_id, exc)
        run.status = "failed"
        run.error = f"Planning failed: {exc}"
        run.completed_at = utcnow()
        db.commit()
        _notify(run)
        return run

    run.planner_summary = plan.summary
    run.total_tokens += plan.tokens
    for planned in plan.steps:
        db.add(
            Step(
                org_id=run.org_id,
                run_id=run.id,
                index=planned.index,
                title=planned.title,
                instruction=planned.instruction,
                agent_id=planned.agent_id,
                agent_name=planned.agent_name,
                status="pending",
            )
        )
    run.status = "running"
    db.commit()
    _notify(run)

    agents_by_id = {agent.id: agent for agent in agents if agent.id}
    prior_outputs: list[tuple[str, str]] = []
    steps = db.scalars(select(Step).where(Step.run_id == run.id).order_by(Step.index)).all()

    for step in steps:
        step.status = "running"
        step.started_at = utcnow()
        db.commit()
        _notify(run)

        def record_tool_call(outcome: ToolOutcome, step_id: str = step.id) -> None:
            db.add(
                ToolCall(
                    org_id=run.org_id,
                    step_id=step_id,
                    tool_name=outcome.tool_name,
                    arguments=outcome.arguments,
                    result=outcome.result,
                    status=outcome.status,
                    error=outcome.error,
                    duration_ms=outcome.duration_ms,
                )
            )
            db.commit()
            _notify(run)

        try:
            result = run_step(
                agent=agents_by_id.get(step.agent_id) if step.agent_id else None,
                goal=run.goal,
                step_title=step.title,
                instruction=step.instruction,
                prior_outputs=prior_outputs,
                provider=provider,
                on_tool_call=record_tool_call,
                is_final_step=(step.index == len(steps) - 1),
            )
        except AgentRunError as exc:
            logger.warning("step %s of run %s failed: %s", step.index, run_id, exc)
            step.status = "failed"
            step.error = str(exc)
            step.completed_at = utcnow()
            run.status = "failed"
            run.error = f"Step {step.index + 1} failed: {exc}"
            run.completed_at = utcnow()
            db.commit()
            _notify(run)
            return run

        step.status = "done"
        step.output = result.output
        step.tokens = result.tokens
        step.completed_at = utcnow()
        run.total_tokens += result.tokens
        db.commit()
        _notify(run)

        prior_outputs.append((step.title, result.output))

    run.status = "done"
    run.final_output = prior_outputs[-1][1] if prior_outputs else None
    run.completed_at = utcnow()
    db.commit()
    record_tokens(db, run.org_id, run.total_tokens or 0)
    _notify(run)
    return run


def _notify(run: Run) -> None:
    events.bump(events.run_topic(run.id))
    events.bump(events.user_topic(run.org_id))
