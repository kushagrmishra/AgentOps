from __future__ import annotations

import threading
from collections import defaultdict

_lock = threading.Lock()
_versions: dict[str, int] = defaultdict(int)


def bump(topic: str) -> int:
    """Signal that a topic changed. Called from orchestrator worker threads."""
    with _lock:
        _versions[topic] += 1
        return _versions[topic]


def version(topic: str) -> int:
    with _lock:
        return _versions[topic]


def run_topic(run_id: str) -> str:
    return f"run:{run_id}"


def eval_topic(eval_run_id: str) -> str:
    return f"eval:{eval_run_id}"


def user_topic(user_id: str) -> str:
    return f"user:{user_id}"
