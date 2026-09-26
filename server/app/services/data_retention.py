from __future__ import annotations

import logging
import os
import shutil
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Run, Step, ToolCall, UsageEvent

logger = logging.getLogger(__name__)


def purge_expired_runs(db: Session, retention_days: int = 90, org_id: str | None = None) -> int:
    """Delete completed or failed runs older than the specified retention window."""
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    query = select(Run).where(Run.created_at < cutoff, Run.status.in_(["done", "failed"]))
    if org_id:
        query = query.where(Run.org_id == org_id)

    expired_runs = list(db.scalars(query).all())
    count = len(expired_runs)
    for run in expired_runs:
        db.delete(run)
    db.commit()
    logger.info("Purged %d expired runs older than %d days", count, retention_days)
    return count


def purge_expired_artifacts(workspace_dir: Path | str, max_age_days: int = 30) -> int:
    """Purge temporary generated workspace files older than max_age_days."""
    root = Path(workspace_dir)
    if not root.exists():
        return 0

    cutoff_seconds = time.time() - (max_age_days * 86400)
    purged_count = 0

    for item in root.glob("**/*"):
        if item.is_file() and not item.name.startswith(".gitkeep"):
            try:
                if item.stat().st_mtime < cutoff_seconds:
                    item.unlink()
                    purged_count += 1
            except Exception as exc:
                logger.warning("Failed to purge artifact %s: %s", item, exc)

    logger.info("Purged %d workspace artifacts older than %d days", purged_count, max_age_days)
    return purged_count
