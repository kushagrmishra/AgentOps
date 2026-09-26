from __future__ import annotations

import asyncio
import pytest
from app.models import Organization, OrgMembership, Run, User
from app.services.events import bump, run_topic, subscribe, version
from app.services.pubsub import get_pubsub


def test_tenant_data_cannot_be_accessed_by_another_org(client, db):
    # Create two isolated organizations with Clerk org IDs and owners
    org_a = Organization(id="org-isolation-a", clerk_org_id="clerk-org-iso-a", name="Tenant Alpha")
    org_b = Organization(id="org-isolation-b", clerk_org_id="clerk-org-iso-b", name="Tenant Beta")
    user_a = User(id="user-isolation-a", clerk_user_id="clerk-user-iso-a", email="a@tenant-a.com")
    user_b = User(id="user-isolation-b", clerk_user_id="clerk-user-iso-b", email="b@tenant-b.com")
    db.add_all([org_a, org_b, user_a, user_b])
    db.commit()

    db.add_all([
        OrgMembership(id="mem-iso-a", org_id=org_a.id, user_id=user_a.id, role="owner"),
        OrgMembership(id="mem-iso-b", org_id=org_b.id, user_id=user_b.id, role="owner"),
        Run(id="run-iso-a", org_id=org_a.id, user_id=user_a.id, goal="Internal Alpha Plan", status="done"),
        Run(id="run-iso-b", org_id=org_b.id, user_id=user_b.id, goal="Proprietary Beta IP", status="done"),
    ])
    db.commit()

    # User A requests Run B -> Must return 404
    client.headers["Authorization"] = f"Bearer test-clerk:{user_a.clerk_user_id}:{org_a.clerk_org_id}:owner"
    res_b = client.get(f"/api/runs/run-iso-b")
    assert res_b.status_code == 404, f"Expected 404 for cross-tenant run access, got {res_b.status_code}"

    # User A requests their own Run A -> Must return 200
    res_a = client.get(f"/api/runs/run-iso-a")
    assert res_a.status_code == 200, f"Expected 200 for owned run access, got {res_a.status_code}: {res_a.text}"
    assert res_a.json()["goal"] == "Internal Alpha Plan"

    # User A listing runs should only see Run A, never Run B
    list_res = client.get("/api/runs")
    assert list_res.status_code == 200
    run_ids = [r["id"] for r in list_res.json()]
    assert "run-iso-a" in run_ids
    assert "run-iso-b" not in run_ids


def test_tenant_cannot_delete_other_org_run(client, db):
    org_a = Organization(id="org-del-a", clerk_org_id="clerk-org-del-a", name="Delete Org A")
    org_b = Organization(id="org-del-b", clerk_org_id="clerk-org-del-b", name="Delete Org B")
    user_a = User(id="user-del-a", clerk_user_id="clerk-user-del-a", email="del_a@test.com")
    user_b = User(id="user-del-b", clerk_user_id="clerk-user-del-b", email="del_b@test.com")
    db.add_all([org_a, org_b, user_a, user_b])
    db.commit()

    run_b = Run(id="run-del-b", org_id=org_b.id, user_id=user_b.id, goal="Do Not Delete", status="done")
    db.add_all([
        OrgMembership(id="mem-del-a", org_id=org_a.id, user_id=user_a.id, role="owner"),
        OrgMembership(id="mem-del-b", org_id=org_b.id, user_id=user_b.id, role="owner"),
        run_b,
    ])
    db.commit()

    # Org A tries to DELETE Org B's run
    client.headers["Authorization"] = f"Bearer test-clerk:{user_a.clerk_user_id}:{org_a.clerk_org_id}:owner"
    res = client.delete(f"/api/runs/{run_b.id}")
    assert res.status_code == 404, "Tenant must not be able to delete another tenant's run"

    # Verify run_b still exists in database
    db.expire_all()
    assert db.get(Run, run_b.id) is not None


def test_pubsub_event_distribution():
    async def _runner():
        topic = run_topic("test-stream-pubsub-run")
        sub = subscribe(topic)

        # Bump topic from another thread/routine
        v1 = bump(topic)
        assert v1 >= 1

        # Receive the notification
        msg = await asyncio.wait_for(sub.__anext__(), timeout=2.0)
        assert msg == str(v1)

    asyncio.run(_runner())
