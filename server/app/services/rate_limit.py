from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

from app.core.config import settings

_memory: dict[str, deque[float]] = defaultdict(deque)


def _redis_limit(key: str, limit: int, window_seconds: int) -> bool:
    """Upstash REST ZADD/ZREMRANGEBYSCORE style sliding window. Returns True if allowed."""
    if not settings.upstash_redis_rest_url or not settings.upstash_redis_rest_token:
        return _memory_limit(key, limit, window_seconds)
    try:
        import httpx

        now = time.time()
        member = f"{now}"
        headers = {"Authorization": f"Bearer {settings.upstash_redis_rest_token}"}
        base = settings.upstash_redis_rest_url.rstrip("/")
        # Pipeline: zremrangebyscore, zadd, zcard, expire
        pipe = [
            ["ZREMRANGEBYSCORE", key, "0", str(now - window_seconds)],
            ["ZADD", key, str(now), member],
            ["ZCARD", key],
            ["EXPIRE", key, str(window_seconds)],
        ]
        resp = httpx.post(f"{base}/pipeline", json=pipe, headers=headers, timeout=3.0)
        resp.raise_for_status()
        results = resp.json()
        # zcard result is typically results[2]["result"]
        count = int(results[2].get("result", 0))
        return count <= limit
    except Exception:
        return _memory_limit(key, limit, window_seconds)


def _memory_limit(key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    q = _memory[key]
    while q and q[0] <= now - window_seconds:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def enforce_rate_limit(key: str, limit: int = 60, window_seconds: int = 60) -> None:
    if not _redis_limit(key, limit, window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Retry shortly.",
        )
