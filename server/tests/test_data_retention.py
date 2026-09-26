from __future__ import annotations

import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.models import Organization, Run, User
from app.services.data_retention import purge_expired_artifacts, purge_expired_runs


def test_purge_expired_runs(db):
    org = Organization(id="org-retention-test", name="Retention Org")
    user = User(id="user-retention-test", clerk_user_id="clerk-ret-1", email="ret@test.com")
    db.add_all([org, user])
    db.commit()

    old_date = datetime.now(UTC) - timedelta(days=120)
    recent_date = datetime.now(UTC) - timedelta(days=5)

    old_run = Run(
        id="run-expired-old",
        org_id=org.id,
        user_id=user.id,
        goal="Old Goal",
        status="done",
        created_at=old_date,
    )
    recent_run = Run(
        id="run-recent-keep",
        org_id=org.id,
        user_id=user.id,
        goal="Recent Goal",
        status="done",
        created_at=recent_date,
    )
    db.add_all([old_run, recent_run])
    db.commit()

    # Purge runs older than 90 days
    purged = purge_expired_runs(db, retention_days=90, org_id=org.id)
    assert purged >= 1

    # Old run must be deleted, recent run must remain
    assert db.get(Run, "run-expired-old") is None
    assert db.get(Run, "run-recent-keep") is not None


def test_purge_expired_artifacts(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    old_file = workspace / "old_report.md"
    old_file.write_text("# Old Report")
    # Backdate mtime by 45 days
    old_mtime = time.time() - (45 * 86400)
    os.utime(old_file, (old_mtime, old_mtime))

    new_file = workspace / "new_report.md"
    new_file.write_text("# New Report")

    purged = purge_expired_artifacts(workspace, max_age_days=30)
    assert purged == 1
    assert not old_file.exists()
    assert new_file.exists()
