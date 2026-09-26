from __future__ import annotations

import logging
import threading
from collections import defaultdict
from typing import AsyncIterator

from app.services.pubsub import get_pubsub

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_versions: dict[str, int] = defaultdict(int)


def bump(topic: str) -> int:
    """Signal that a topic changed. Called from orchestrator worker threads."""
    with _lock:
        _versions[topic] += 1
        new_version = _versions[topic]

    # Notify distributed / async pub-sub subscribers
    try:
        pubsub = get_pubsub()
        pubsub.publish(topic, str(new_version))
    except Exception as exc:
        logger.debug("PubSub broadcast on topic %s failed: %s", topic, exc)

    return new_version


def version(topic: str) -> int:
    with _lock:
        return _versions[topic]


def subscribe(topic: str) -> AsyncIterator[str]:
    """Asynchronously subscribe to notifications on a topic."""
    pubsub = get_pubsub()
    return pubsub.subscribe(topic)


def run_topic(run_id: str) -> str:
    return f"run:{run_id}"


def eval_topic(eval_run_id: str) -> str:
    return f"eval:{eval_run_id}"


def user_topic(user_id: str) -> str:
    return f"user:{user_id}"
