from __future__ import annotations

from app.core.plans import limits_for
from app.models import Subscription, UsagePeriod
from app.services.billing import assert_can_create_run, get_or_create_usage
from fastapi import HTTPException
from sqlalchemy import select
import pytest


def test_personal_plan_limits_are_unlimited():
    assert limits_for("free")["runs_per_month"] >= 100_000


def test_personal_plan_never_rejects_over_quota(auth_client, db):
    me = auth_client.get("/api/me").json()
    org_id = me["active_org_id"]
    usage = get_or_create_usage(db, org_id)
    usage.run_count = 999_999
    db.commit()
    # In personal edition, runs are always permitted without 402 errors
    assert_can_create_run(db, org_id)


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
