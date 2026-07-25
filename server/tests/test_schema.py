"""Schema portability and timestamp handling.

Local development runs on SQLite and deployment on PostgreSQL, so the models have
to compile and behave the same on both. There is no Postgres in the test
environment, so the Postgres half is asserted at the DDL level.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.schema import CreateTable

from app.db.base import Base, utcnow
from app.models import Run, User

TIMESTAMP_COLUMNS = {
    "users": {"created_at", "last_login_at"},
    "organizations": {"created_at"},
    "org_memberships": {"created_at"},
    "subscriptions": {"created_at"},
    "usage_periods": {"created_at"},
    "runs": {"created_at", "started_at", "completed_at"},
    "steps": {"created_at", "started_at", "completed_at"},
    "tool_calls": {"created_at"},
    "agent_definitions": {"created_at", "updated_at"},
    "eval_scenarios": {"created_at"},
    "eval_runs": {"created_at", "completed_at"},
    "eval_results": {"created_at"},
}


def _ddl(table, dialect) -> str:
    return str(CreateTable(table).compile(dialect=dialect))


@pytest.mark.parametrize("dialect", [postgresql.dialect(), sqlite.dialect()], ids=["postgres", "sqlite"])
def test_every_table_compiles_for_both_dialects(dialect):
    for table in Base.metadata.sorted_tables:
        assert _ddl(table, dialect).startswith("\nCREATE TABLE")


def test_postgres_gets_timestamptz_for_every_timestamp():
    """A naive `timestamp` column would silently drop the offset."""
    dialect = postgresql.dialect()
    for table in Base.metadata.sorted_tables:
        expected = TIMESTAMP_COLUMNS.get(table.name, set())
        assert expected, f"{table.name} is missing from TIMESTAMP_COLUMNS"
        ddl = _ddl(table, dialect)
        for column in expected:
            assert f"{column} TIMESTAMP WITH TIME ZONE" in ddl, f"{table.name}.{column}"


def test_postgres_gets_jsonb_for_json_columns():
    ddl = "\n".join(_ddl(table, postgresql.dialect()) for table in Base.metadata.sorted_tables)
    assert "JSONB" in ddl
    assert "JSON," not in ddl  # the portable JSON variant must not leak through


def test_deleting_a_user_cascades_to_their_data():
    ddl = "\n".join(_ddl(table, postgresql.dialect()) for table in Base.metadata.sorted_tables)
    assert ddl.count("REFERENCES users (id) ON DELETE CASCADE") >= 4


# ------------------------------------------------------- timestamp behaviour


def test_timestamps_come_back_timezone_aware(db):
    """SQLite has no native tz support, so this is the round-trip that matters:
    a naive value here serialises without an offset and clients read it as local
    time, which shows a fresh run as hours old."""
    user = User(email=f"tz-{utcnow().timestamp()}@example.com", password_hash="x")
    db.add(user)
    db.commit()

    stored = db.get(User, user.id)
    assert stored is not None
    assert stored.created_at.tzinfo is not None
    assert stored.created_at.utcoffset() == timedelta(0)


def test_a_non_utc_timestamp_is_normalised_to_utc(db):
    """Whatever zone a caller writes in, reads come back as UTC."""
    tokyo = timezone(timedelta(hours=9))
    written = datetime(2026, 7, 24, 21, 30, 0, tzinfo=tokyo)

    user = User(email=f"tokyo-{utcnow().timestamp()}@example.com", password_hash="x")
    user.last_login_at = written
    db.add(user)
    db.commit()

    stored = db.get(User, user.id)
    assert stored is not None and stored.last_login_at is not None
    assert stored.last_login_at.utcoffset() == timedelta(0)
    assert stored.last_login_at == written.astimezone(UTC)


def test_timestamps_serialise_with_an_offset(auth_client):
    """What the client actually parses."""
    response = auth_client.post("/api/runs", json={"goal": "Check the timestamp format."})
    assert response.status_code == 201, response.text
    created_at = response.json()["created_at"]
    assert created_at.endswith("Z") or created_at.endswith("+00:00"), created_at
    # And it parses back to roughly now, not hours away.
    parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    assert abs((utcnow() - parsed).total_seconds()) < 60


def test_a_run_duration_is_measured_in_seconds_not_hours(auth_client):
    """Guards the client-side duration calculation against offset drift."""
    response = auth_client.post("/api/runs", json={"goal": "Measure how long this takes."})
    run_id = response.json()["id"]

    for _ in range(200):
        detail = auth_client.get(f"/api/runs/{run_id}").json()
        if detail["status"] in {"done", "failed"}:
            break
    assert detail["status"] == "done", detail.get("error")

    started = datetime.fromisoformat(detail["started_at"].replace("Z", "+00:00"))
    completed = datetime.fromisoformat(detail["completed_at"].replace("Z", "+00:00"))
    elapsed = (completed - started).total_seconds()
    assert 0 <= elapsed < 60, f"{elapsed}s between start and finish"
