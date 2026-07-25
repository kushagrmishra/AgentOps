from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def capture(event: str, distinct_id: str, properties: dict | None = None) -> None:
    if not settings.posthog_api_key:
        return
    try:
        from posthog import Posthog

        client = Posthog(settings.posthog_api_key, host=settings.posthog_host)
        client.capture(distinct_id=distinct_id, event=event, properties=properties or {})
    except Exception:
        logger.exception("posthog capture failed for %s", event)
