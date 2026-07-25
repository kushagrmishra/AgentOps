from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, JSON, String, TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, mapped_column


class UtcDateTime(TypeDecorator):
    """A timestamp that always round-trips as timezone-aware UTC.

    SQLite has no native timezone support and hands back naive datetimes, which
    then serialise to JSON without an offset — and a client parsing
    `2026-07-24T18:59:00` treats it as *local* time, so "just now" renders as
    hours ago. Postgres `timestamptz` already behaves; this makes both identical.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, _dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, _dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    """Types are chosen to be portable: string UUIDs, UTC-normalised timestamps,
    and JSON that upgrades to JSONB on PostgreSQL, so the same models run on
    SQLite and Postgres."""

    type_annotation_map = {dict: JSON().with_variant(JSONB(), "postgresql")}


JsonColumn = JSON().with_variant(JSONB(), "postgresql")


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


def id_column():
    return mapped_column(String(36), primary_key=True, default=new_id)


def created_at_column():
    return mapped_column(UtcDateTime, default=utcnow, nullable=False, index=True)
