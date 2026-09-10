from __future__ import annotations

import json
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import AgentDefinition, EvalScenario

DEFAULT_AGENTS = [
    {
        "name": "researcher",
        "description": "Gathers sources, documents, and background for a goal.",
        "system_prompt": "You are a careful researcher. Prefer citing sources with URLs and inspecting relevant files.",
        "tools": ["web_search", "read_file", "list_files"],
    },
    {
        "name": "analyst",
        "description": "Runs analysis and computations on gathered facts.",
        "system_prompt": "You are a quantitative analyst. Show your arithmetic and save structured outputs when needed.",
        "tools": ["run_code", "read_file", "write_file", "list_files"],
    },
    {
        "name": "writer",
        "description": "Produces the final deliverable brief or report.",
        "system_prompt": "You are a concise technical writer. End with a concrete recommendation.",
        "tools": ["read_file", "write_file", "list_files"],
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
    """Seed default agents and scenarios. Checks for existing records before
    inserting to prevent duplicates, even when the unique constraint is absent."""
    from app.db.base import new_id
    from datetime import UTC, datetime

    # Gather names already present so we skip them.
    existing_agents = {
        row[0]
        for row in db.execute(
            text("SELECT name FROM agent_definitions WHERE org_id = :org_id"),
            {"org_id": org_id},
        ).all()
    }
    existing_scenarios = {
        row[0]
        for row in db.execute(
            text("SELECT name FROM eval_scenarios WHERE org_id = :org_id"),
            {"org_id": org_id},
        ).all()
    }

    now = datetime.now(UTC).isoformat()
    for spec in DEFAULT_AGENTS:
        if spec["name"] in existing_agents:
            db.execute(
                text(
                    "UPDATE agent_definitions SET tools = :tools WHERE org_id = :org_id AND name = :name AND is_seed = 1"
                ),
                {"tools": json.dumps(spec["tools"]), "org_id": org_id, "name": spec["name"]},
            )
            continue
        db.execute(
            text(
                "INSERT OR IGNORE INTO agent_definitions "
                "(id, org_id, user_id, name, description, system_prompt, tools, is_active, is_seed, created_at, updated_at) "
                "VALUES (:id, :org_id, :user_id, :name, :desc, :prompt, :tools, 1, 1, :now, :now)"
            ),
            {
                "id": new_id(), "org_id": org_id, "user_id": user_id,
                "name": spec["name"], "desc": spec["description"], "prompt": spec["system_prompt"], "tools": json.dumps(spec["tools"]),
                "now": now,
            },
        )
    for scenario in DEFAULT_SCENARIOS:
        if scenario["name"] in existing_scenarios:
            continue
        db.execute(
            text(
                "INSERT OR IGNORE INTO eval_scenarios "
                "(id, org_id, user_id, name, goal, expected_outcome, is_active, is_seed, created_at) "
                "VALUES (:id, :org_id, :user_id, :name, :goal, :outcome, 1, 1, :now)"
            ),
            {
                "id": new_id(), "org_id": org_id, "user_id": user_id,
                "name": scenario["name"], "goal": scenario["goal"], "outcome": scenario["expected_outcome"], "now": now,
            },
        )
    db.commit()


def deduplicate_seeds(db: Session) -> None:
    """Remove duplicate seed rows, keeping only the oldest row per (org_id, name).

    This is a one-time cleanup for databases that accumulated duplicates before
    the idempotency guard was added to seed_org_defaults.
    """
    from sqlalchemy import delete, func, select

    for model in (AgentDefinition, EvalScenario):
        # Subquery: the minimum id per (org_id, name) among seed rows.
        min_ids = (
            select(
                model.org_id,
                model.name,
                func.min(model.id).label("min_id"),
            )
            .where(model.is_seed.is_(True))
            .group_by(model.org_id, model.name)
            .subquery()
        )
        # Delete seed rows whose id is not the min for its (org_id, name).
        stmt = (
            delete(model)
            .where(model.is_seed.is_(True))
            .where(
                model.id.notin_(
                    select(min_ids.c.min_id)
                )
            )
        )
        db.execute(stmt)
    db.commit()


# Back-compat alias
def seed_user_defaults(db: Session, user_id: str) -> None:
    """Deprecated: prefer seed_org_defaults."""
    pass
