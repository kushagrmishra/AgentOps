from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger("agentops.telemetry")

# In-memory metric counters for Prometheus / internal stats
_METRICS: dict[str, dict[str, int]] = {
    "agent_steps_total": {},
    "tool_calls_total": {},
    "tokens_consumed_total": {},
}
_LATENCIES: dict[str, list[float]] = {}


def record_step_execution(org_id: str, model: str, status: str = "done") -> None:
    key = f"{model}:{status}"
    _METRICS["agent_steps_total"][key] = _METRICS["agent_steps_total"].get(key, 0) + 1
    logger.info(
        "telemetry: agent_step org_id=%s model=%s status=%s",
        org_id,
        model,
        status,
        extra={"event": "agent_step", "org_id": org_id, "model": model, "status": status},
    )


def record_tool_call(tool_name: str, status: str = "ok", duration_ms: int = 0) -> None:
    key = f"{tool_name}:{status}"
    _METRICS["tool_calls_total"][key] = _METRICS["tool_calls_total"].get(key, 0) + 1
    logger.info(
        "telemetry: tool_call tool=%s status=%s duration_ms=%d",
        tool_name,
        status,
        duration_ms,
        extra={"event": "tool_call", "tool": tool_name, "status": status, "duration_ms": duration_ms},
    )


def record_token_usage(provider: str, model: str, tokens: int) -> None:
    key = f"{provider}:{model}"
    _METRICS["tokens_consumed_total"][key] = _METRICS["tokens_consumed_total"].get(key, 0) + tokens
    logger.info(
        "telemetry: tokens_consumed provider=%s model=%s tokens=%d",
        provider,
        model,
        tokens,
        extra={"event": "tokens", "provider": provider, "model": model, "tokens": tokens},
    )


def record_run_latency(provider: str, model: str, duration_seconds: float) -> None:
    key = f"{provider}:{model}"
    _LATENCIES.setdefault(key, []).append(duration_seconds)
    logger.info(
        "telemetry: run_latency provider=%s model=%s duration_sec=%.2f",
        provider,
        model,
        duration_seconds,
        extra={"event": "run_latency", "provider": provider, "model": model, "duration_seconds": duration_seconds},
    )


def get_telemetry_snapshot() -> dict[str, Any]:
    return {
        "metrics": _METRICS,
        "latencies_count": {k: len(v) for k, v in _LATENCIES.items()},
    }
