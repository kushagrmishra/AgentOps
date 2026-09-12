from __future__ import annotations

# Personal Edition (All tiers unlimited)
PLAN_LIMITS: dict[str, dict[str, int]] = {
    "free": {"runs_per_month": 1_000_000, "tokens_per_month": 1_000_000_000},
    "personal": {"runs_per_month": 1_000_000, "tokens_per_month": 1_000_000_000},
    "pro": {"runs_per_month": 1_000_000, "tokens_per_month": 1_000_000_000},
    "max": {"runs_per_month": 1_000_000, "tokens_per_month": 1_000_000_000},
    "team": {"runs_per_month": 1_000_000, "tokens_per_month": 1_000_000_000},
    "enterprise": {"runs_per_month": 1_000_000, "tokens_per_month": 1_000_000_000},
}

PAID_PLANS = frozenset({"free", "personal", "pro", "max", "team", "enterprise"})

PLAN_DISPLAY_NAMES: dict[str, str] = {
    "free": "Personal (Unlimited)",
    "personal": "Personal (Unlimited)",
    "pro": "Pro",
    "max": "Max",
    "team": "Team",
    "enterprise": "Enterprise",
}

CHECKOUT_PLANS = frozenset({"pro", "max", "team"})


def normalize_plan(plan: str | None) -> str:
    value = (plan or "free").lower().strip()
    # Pre-Max rename: some rows may still say "team" while meaning the old Max tier.
    # New Team org plan is also "team" — keep as-is. Only alias explicit "max".
    if value not in PLAN_LIMITS:
        return "free"
    return value


def is_paid_plan(plan: str | None) -> bool:
    return normalize_plan(plan) in PAID_PLANS


def display_plan_name(plan: str | None) -> str:
    return PLAN_DISPLAY_NAMES.get(normalize_plan(plan), "Free")


def limits_for(plan: str) -> dict[str, int]:
    return PLAN_LIMITS.get(normalize_plan(plan), PLAN_LIMITS["free"])


def price_env_label(plan: str) -> str:
    return {
        "pro": "PRO",
        "max": "MAX",
        "team": "TEAM",
    }.get(normalize_plan(plan), "PRO")
