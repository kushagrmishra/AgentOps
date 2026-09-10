from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models import PASS_THRESHOLD, EvalResult, EvalRun, EvalScenario, Run, User
from app.services import events
from app.services.billing import get_or_create_subscription
from app.services.llm import LlmError, LlmMessage, LlmProvider, get_provider
from app.services.orchestrator import execute_run
from app.services.rubric import score_against_expectation
from app.services.worker import WorkerPool

logger = logging.getLogger(__name__)

# Each suite replays whole runs, so keep concurrency below the run pool's.
_pool = WorkerPool(max_workers=2, thread_name_prefix="agentops-eval")

JUDGE_SYSTEM_PROMPT = """You are an impartial evaluator for a multi-agent system. You \
compare a pipeline's actual output against the expected outcome for a goal and score how \
well the expectation was met.

Scoring guide:
- 1.0: fully satisfies the expected outcome
- 0.7-0.9: substantially correct, minor omissions
- 0.4-0.6: partially addresses it, notable gaps
- 0.0-0.3: wrong, empty, or off-topic

Judge substance, not wording. Respond with JSON only:
{"score": <number between 0 and 1>, "reasoning": "<two sentences max>"}"""


@dataclass(slots=True)
class ScoreResult:
    score: float
    passed: bool
    reasoning: str
    method: str


def normalize_score(value: object) -> float | None:
    """Coerce a judge's score into 0.0-1.0, or None if unusable.

    Judges return "0.8", 8/10, or 85 (percent) depending on mood, so normalise
    rather than trusting the range.
    """
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip().rstrip("%")
        if "/" in cleaned:
            numerator, _, denominator = cleaned.partition("/")
            try:
                numerator_value, denominator_value = float(numerator), float(denominator)
            except ValueError:
                return None
            if denominator_value <= 0:
                return None
            return max(0.0, min(1.0, numerator_value / denominator_value))
        try:
            value = float(cleaned)
        except ValueError:
            return None
    if not isinstance(value, (int, float)):
        return None

    number = float(value)
    if number != number or number in (float("inf"), float("-inf")):  # NaN / inf
        return None
    if number < 0:
        return 0.0
    if number <= 1:
        return number
    if number <= 10:  # a 0-10 rating
        return number / 10
    if number <= 100:  # a percentage
        return number / 100
    return 1.0


def heuristic_score(actual: str, expected: str) -> ScoreResult:
    """Deterministic rubric scorer used when no judge is available."""
    rubric = score_against_expectation(actual or "", expected or "")
    return ScoreResult(
        score=rubric.score,
        passed=rubric.score >= PASS_THRESHOLD,
        reasoning=rubric.summary,
        method="heuristic",
    )


def build_judge_prompt(goal: str, expected: str, actual: str) -> str:
    return (
        f"GOAL: {goal.strip()}\n\n"
        f"EXPECTED_OUTCOME: {expected.strip()}\n\n"
        f"ACTUAL_OUTPUT: {(actual or '(empty)').strip()[:6000]}"
    )


def score_output(
    *, goal: str, expected: str, actual: str, provider: LlmProvider | None = None
) -> ScoreResult:
    """Score one scenario, degrading to the heuristic scorer on any judge failure."""
    if not (actual or "").strip():
        return ScoreResult(
            score=0.0, passed=False, reasoning="The pipeline produced no output.", method="heuristic"
        )
    if provider is None:
        return heuristic_score(actual, expected)

    try:
        payload, _ = provider.complete_json(
            system=JUDGE_SYSTEM_PROMPT,
            messages=[LlmMessage(role="user", content=build_judge_prompt(goal, expected, actual))],
            intent="judge",
        )
    except LlmError as exc:
        logger.info("judge call failed, using heuristic scorer: %s", exc)
        fallback = heuristic_score(actual, expected)
        fallback.reasoning = f"Judge unavailable ({exc}). {fallback.reasoning}"
        return fallback

    score = normalize_score(payload.get("score"))
    if score is None:
        fallback = heuristic_score(actual, expected)
        fallback.reasoning = f"Judge returned an unusable score. {fallback.reasoning}"
        return fallback

    reasoning = " ".join(str(payload.get("reasoning") or "").split()) or "No reasoning provided."
    return ScoreResult(
        score=round(score, 3),
        passed=score >= PASS_THRESHOLD,
        reasoning=reasoning,
        method=f"llm-judge:{provider.name}",
    )


def submit_eval_run(eval_run_id: str, scenario_ids: list[str] | None = None) -> None:
    """Queue a suite for background execution. Empty selection means every
    active scenario."""
    _pool.submit(_execute_eval_run_safe, eval_run_id, scenario_ids)


def shutdown_executor() -> None:
    _pool.shutdown()


def _execute_eval_run_safe(eval_run_id: str, scenario_ids: list[str] | None = None) -> None:
    try:
        with SessionLocal() as db:
            execute_eval_run(db, eval_run_id, scenario_ids)
    except Exception:  # pragma: no cover - worker guard
        logger.exception("eval run %s crashed", eval_run_id)
        try:
            with SessionLocal() as db:
                eval_run = db.get(EvalRun, eval_run_id)
                if eval_run and eval_run.status == "running":
                    eval_run.status = "failed"
                    eval_run.error = "internal error while running the eval suite"
                    eval_run.completed_at = utcnow()
                    db.commit()
                    events.bump(events.eval_topic(eval_run_id))
        except Exception:
            logger.exception("could not mark eval run %s as failed", eval_run_id)


def execute_eval_run(db: Session, eval_run_id: str, scenario_ids: list[str] | None = None) -> EvalRun:
    """Replay each scenario through the full pipeline, then score the output."""
    eval_run = db.get(EvalRun, eval_run_id)
    if eval_run is None:
        raise ValueError(f"eval run {eval_run_id} not found")

    query = select(EvalScenario).where(
        EvalScenario.org_id == eval_run.org_id, EvalScenario.is_active.is_(True)
    )
    if scenario_ids:
        query = query.where(EvalScenario.id.in_(scenario_ids))
    scenarios = db.scalars(query.order_by(EvalScenario.created_at)).all()

    eval_run.total = len(scenarios)
    db.commit()
    events.bump(events.eval_topic(eval_run.id))

    if not scenarios:
        eval_run.status = "failed"
        eval_run.error = "No active scenarios to evaluate."
        eval_run.completed_at = utcnow()
        db.commit()
        events.bump(events.eval_topic(eval_run.id))
        return eval_run

    user = db.get(User, eval_run.user_id)
    sub = get_or_create_subscription(db, eval_run.org_id)
    judge = get_provider(user, plan=sub.plan)
    scores: list[float] = []

    for scenario in scenarios:
        db.refresh(eval_run)
        if eval_run.status != "running":
            logger.info("eval run %s was terminated (status=%s), breaking", eval_run.id, eval_run.status)
            break
        try:
            db.refresh(scenario)
        except Exception:
            logger.warning("scenario %s was deleted during eval run, skipping", scenario.id)
            continue
        started = time.perf_counter()
        run = Run(org_id=eval_run.org_id, user_id=eval_run.user_id, goal=scenario.goal, source="eval", status="planning")
        db.add(run)
        db.commit()
        events.bump(events.user_topic(eval_run.org_id))

        error: str | None = None
        try:
            executed = execute_run(db, run.id)
            actual = executed.final_output or ""
            if executed.status == "failed":
                error = executed.error or "run failed"
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("scenario %s failed to execute", scenario.id)
            actual, error = "", f"{type(exc).__name__}: {exc}"

        result = score_output(
            goal=scenario.goal, expected=scenario.expected_outcome, actual=actual, provider=judge
        )
        scores.append(result.score)

        db.add(
            EvalResult(
                eval_run_id=eval_run.id,
                scenario_id=scenario.id,
                run_id=run.id,
                scenario_name=scenario.name,
                score=result.score,
                passed=result.passed,
                judge_reasoning=f"[{result.method}] {result.reasoning}",
                actual_output=actual[:8000] or None,
                error=error,
                duration_ms=int((time.perf_counter() - started) * 1000),
            )
        )
        eval_run.passed = sum(1 for score in scores if score >= PASS_THRESHOLD)
        eval_run.failed = len(scores) - eval_run.passed
        eval_run.avg_score = round(sum(scores) / len(scores), 3)
        db.commit()
        events.bump(events.eval_topic(eval_run.id))

    eval_run.status = "done"
    eval_run.completed_at = utcnow()
    db.commit()
    events.bump(events.eval_topic(eval_run.id))
    return eval_run
