from __future__ import annotations

PLAN_LIMITS: dict[str, dict[str, int]] = {
    "free": {"runs_per_month": 20, "tokens_per_month": 200_000},
    "pro": {"runs_per_month": 500, "tokens_per_month": 5_000_000},
    "team": {"runs_per_month": 5_000, "tokens_per_month": 50_000_000},
}


def limits_for(plan: str) -> dict[str, int]:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
