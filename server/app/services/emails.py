from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send(to: str, subject: str, html: str) -> None:
    if not settings.resend_api_key:
        logger.info("Resend not configured — skip email to %s (%s)", to, subject)
        return
    try:
        import resend

        resend.api_key = settings.resend_api_key
        resend.Emails.send(
            {
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "html": html,
            }
        )
    except Exception:
        logger.exception("failed to send email to %s", to)


def send_welcome(email: str, name: str | None = None) -> None:
    who = name or email
    _send(
        email,
        "Welcome to AgentOps",
        f"<p>Hi {who},</p><p>Your AgentOps workspace is ready. Submit a goal and watch the pipeline.</p>",
    )


def send_failed_payment_alert(org_name: str, email: str | None) -> None:
    if not email:
        return
    _send(
        email,
        "AgentOps payment failed",
        f"<p>We could not process payment for <strong>{org_name}</strong>. "
        f"Update your billing details in Settings to avoid interruption.</p>",
    )


def send_receipt(email: str, plan: str) -> None:
    _send(
        email,
        f"AgentOps receipt — {plan}",
        f"<p>Thanks for subscribing to the <strong>{plan}</strong> plan.</p>",
    )
