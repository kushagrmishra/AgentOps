from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AgentDefinition, EvalScenario

DEFAULT_AGENTS = [
    {
        "name": "researcher",
        "description": "Gathers sources and background for a goal.",
        "system_prompt": "You are a careful researcher. Prefer citing sources with URLs.",
        "tools": ["web_search", "read_file"],
    },
    {
        "name": "analyst",
        "description": "Runs analysis and computations on gathered facts.",
        "system_prompt": "You are a quantitative analyst. Show your arithmetic.",
        "tools": ["run_code", "read_file"],
    },
    {
        "name": "writer",
        "description": "Produces the final deliverable brief.",
        "system_prompt": "You are a concise technical writer. End with a concrete recommendation.",
        "tools": ["read_file"],
    },
]

DEFAULT_SCENARIOS = [
    {
        "name": "Vector DB trade-offs",
        "goal": "Research trade-offs between vector databases for RAG and recommend one.",
        "expected_outcome": "Cites sources with URLs, shows trade-offs, ends with a concrete recommendation.",
    },
    {
        "name": "Cost estimate",
        "goal": "Estimate monthly cost at 2M queries for a RAG workload and show the arithmetic.",
        "expected_outcome": "Shows the arithmetic and a concrete monthly total.",
    },
    {
        "name": "Latency brief",
        "goal": "Summarize latency considerations for multi-agent tool loops.",
        "expected_outcome": "Names assumptions and gives actionable guidance.",
    },
    {
        "name": "Eval rubric",
        "goal": "Draft a short rubric for judging multi-agent run quality.",
        "expected_outcome": "Lists measurable criteria and a scoring approach.",
    },
]


def seed_org_defaults(db: Session, org_id: str, user_id: str) -> None:
    existing = db.scalar(select(AgentDefinition.id).where(AgentDefinition.org_id == org_id).limit(1))
    if existing is None:
        for spec in DEFAULT_AGENTS:
            db.add(AgentDefinition(org_id=org_id, user_id=user_id, is_seed=True, **spec))
    existing_sc = db.scalar(select(EvalScenario.id).where(EvalScenario.org_id == org_id).limit(1))
    if existing_sc is None:
        for scenario in DEFAULT_SCENARIOS:
            db.add(EvalScenario(org_id=org_id, user_id=user_id, is_seed=True, is_active=True, **scenario))
    db.commit()


# Back-compat alias
def seed_user_defaults(db: Session, user_id: str) -> None:
    """Deprecated: prefer seed_org_defaults."""
    pass
