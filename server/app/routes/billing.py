from __future__ import annotations

import logging

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import AuthCtx, DbSession, require_roles
from app.services.analytics import capture
from app.services.billing import get_or_create_subscription
from app.services.emails import send_failed_payment_alert, send_receipt
from app.db.base import new_id
from app.models import Organization, Subscription, User
from sqlalchemy import select

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutOut(BaseModel):
    url: str


class PortalOut(BaseModel):
    url: str


def _stripe():
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    stripe.api_key = settings.stripe_secret_key


@router.post("/checkout", response_model=CheckoutOut)
def create_checkout(ctx: AuthCtx, db: DbSession, plan: str = "pro") -> CheckoutOut:
    _stripe()
    if plan not in {"pro", "team"}:
        raise HTTPException(status_code=400, detail="plan must be pro or team")
    price = settings.stripe_price_pro if plan == "pro" else settings.stripe_price_team
    if not price:
        raise HTTPException(status_code=503, detail=f"STRIPE_PRICE_{plan.upper()} not set")
    sub = get_or_create_subscription(db, ctx.org.id)
    if not sub.stripe_customer_id:
        customer = stripe.Customer.create(
            email=ctx.user.email,
            metadata={"org_id": ctx.org.id},
        )
        sub.stripe_customer_id = customer["id"]
        db.commit()
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=sub.stripe_customer_id,
        line_items=[{"price": price, "quantity": 1}],
        success_url=f"{settings.client_origin}/settings?billing=success",
        cancel_url=f"{settings.client_origin}/settings?billing=cancel",
        metadata={"org_id": ctx.org.id, "plan": plan},
    )
    return CheckoutOut(url=session["url"])


@router.post("/portal", response_model=PortalOut)
def billing_portal(ctx: AuthCtx, db: DbSession) -> PortalOut:
    _stripe()
    sub = get_or_create_subscription(db, ctx.org.id)
    if not sub.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer yet — upgrade first")
    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=f"{settings.client_origin}/settings",
    )
    return PortalOut(url=session["url"])


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: DbSession) -> dict:
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        if settings.stripe_webhook_secret:
            _stripe()
            event = stripe.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
        else:
            import json
            event = json.loads(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Webhook error: {exc}") from exc

    etype = event["type"] if isinstance(event, dict) else event.type
    data = event["data"]["object"] if isinstance(event, dict) else event.data.object

    if etype in {"customer.subscription.created", "customer.subscription.updated"}:
        org_id = (data.get("metadata") or {}).get("org_id")
        customer_id = data.get("customer")
        sub = None
        if org_id:
            sub = db.scalar(select(Subscription).where(Subscription.org_id == org_id))
        if sub is None and customer_id:
            sub = db.scalar(select(Subscription).where(Subscription.stripe_customer_id == customer_id))
        if sub:
            sub.stripe_subscription_id = data.get("id")
            sub.status = data.get("status") or sub.status
            # Map price → plan
            items = (data.get("items") or {}).get("data") or []
            price_id = None
            if items:
                price_id = (items[0].get("price") or {}).get("id")
            previous = sub.plan
            if price_id and price_id == settings.stripe_price_team:
                sub.plan = "team"
            elif price_id and price_id == settings.stripe_price_pro:
                sub.plan = "pro"
            db.commit()
            if sub.plan != previous and sub.plan in {"pro", "team"}:
                capture("plan_upgraded", sub.org_id, {"plan": sub.plan, "previous": previous})
                email = data.get("customer_email")
                if not email:
                    from app.models import OrgMembership

                    owner = db.scalar(
                        select(User)
                        .join(OrgMembership, OrgMembership.user_id == User.id)
                        .where(OrgMembership.org_id == sub.org_id)
                        .order_by(OrgMembership.created_at.asc())
                        .limit(1)
                    )
                    email = owner.email if owner else None
                if email:
                    send_receipt(email, sub.plan)
    elif etype == "customer.subscription.deleted":
        customer_id = data.get("customer")
        sub = db.scalar(select(Subscription).where(Subscription.stripe_customer_id == customer_id))
        if sub:
            sub.plan = "free"
            sub.status = "canceled"
            db.commit()
    elif etype == "invoice.payment_failed":
        customer_id = data.get("customer")
        sub = db.scalar(select(Subscription).where(Subscription.stripe_customer_id == customer_id))
        if sub:
            org = db.get(Organization, sub.org_id)
            send_failed_payment_alert(org.name if org else sub.org_id, data.get("customer_email"))
    return {"received": True}
