from __future__ import annotations

from app.core.plans import limits_for
from app.models import Subscription, UsagePeriod
from app.services.billing import assert_can_create_run, get_or_create_usage
from fastapi import HTTPException
from sqlalchemy import select
import pytest


def test_free_plan_limits_are_defined():
    assert limits_for("free")["runs_per_month"] == 20


def test_plan_limit_rejects_over_quota(auth_client, db):
    me = auth_client.get("/api/me").json()
    org_id = me["active_org_id"]
    usage = get_or_create_usage(db, org_id)
    usage.run_count = 999
    db.commit()
    with pytest.raises(HTTPException) as exc:
        assert_can_create_run(db, org_id)
    assert exc.value.status_code == 402


def test_stripe_webhook_endpoint_accepts_json(auth_client):
    # Without webhook secret, handler accepts raw JSON event payload.
    response = auth_client.post(
        "/api/billing/webhooks/stripe",
        json={
            "type": "customer.subscription.deleted",
            "data": {"object": {"customer": "cus_missing"}},
        },
    )
    assert response.status_code == 200
    assert response.json()["received"] is True
