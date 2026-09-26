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


def test_billing_usage_and_meter_endpoints(auth_client, db):
    # Post a metered usage event (e.g. 500 tokens)
    meter_res = auth_client.post(
        "/api/billing/meter",
        json={"event_type": "token", "quantity": 500},
    )
    assert meter_res.status_code == 201
    assert meter_res.json()["status"] == "recorded"
    assert meter_res.json()["quantity"] == 500

    # Query usage summary
    usage_res = auth_client.get("/api/billing/usage")
    assert usage_res.status_code == 200
    data = usage_res.json()
    assert "period" in data
    assert data["token_count"] >= 0
    assert "run_count" in data
    assert "step_count" in data
