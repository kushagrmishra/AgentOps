from __future__ import annotations

from app.core.telemetry import (
    get_telemetry_snapshot,
    record_run_latency,
    record_step_execution,
    record_token_usage,
    record_tool_call,
)


def test_telemetry_metrics_accumulation():
    record_step_execution(org_id="org-123", model="claude-sonnet-4-5", status="done")
    record_step_execution(org_id="org-123", model="claude-sonnet-4-5", status="done")
    record_tool_call(tool_name="web_search", status="ok", duration_ms=145)
    record_token_usage(provider="anthropic", model="claude-sonnet-4-5", tokens=4200)
    record_run_latency(provider="anthropic", model="claude-sonnet-4-5", duration_seconds=8.5)

    snapshot = get_telemetry_snapshot()
    metrics = snapshot["metrics"]

    assert metrics["agent_steps_total"]["claude-sonnet-4-5:done"] >= 2
    assert metrics["tool_calls_total"]["web_search:ok"] >= 1
    assert metrics["tokens_consumed_total"]["anthropic:claude-sonnet-4-5"] >= 4200
    assert snapshot["latencies_count"]["anthropic:claude-sonnet-4-5"] >= 1
