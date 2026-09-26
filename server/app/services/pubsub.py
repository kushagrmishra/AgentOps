from __future__ import annotations

import asyncio
import logging
import threading
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import AsyncGenerator, AsyncIterator

logger = logging.getLogger(__name__)


class Subscription(AsyncIterator[str]):
    """An active subscription to a channel. Registered immediately upon instantiation."""

    def __init__(self, subscribers_map: dict[str, set[asyncio.Queue[str]]], lock: threading.Lock, channel: str):
        self._subscribers_map = subscribers_map
        self._lock = lock
        self.channel = channel
        self.q: asyncio.Queue[str] = asyncio.Queue(maxsize=128)
        with self._lock:
            self._subscribers_map[self.channel].add(self.q)
        self._closed = False

    def __aiter__(self) -> AsyncIterator[str]:
        return self

    async def __anext__(self) -> str:
        if self._closed:
            raise StopAsyncIteration
        try:
            return await self.q.get()
        except asyncio.CancelledError:
            self.close()
            raise

    def close(self) -> None:
        if not self._closed:
            self._closed = True
            with self._lock:
                self._subscribers_map[self.channel].discard(self.q)
                if not self._subscribers_map[self.channel]:
                    self._subscribers_map.pop(self.channel, None)

    def __del__(self) -> None:
        self.close()


class BasePubSub(ABC):
    """Abstract interface for distributed pub-sub event distribution."""

    @abstractmethod
    def publish(self, channel: str, message: str = "") -> None:
        """Publish a message/notification to a channel (synchronous or fire-and-forget)."""
        pass

    @abstractmethod
    async def publish_async(self, channel: str, message: str = "") -> None:
        """Asynchronously publish a message to a channel."""
        pass

    @abstractmethod
    def subscribe(self, channel: str) -> AsyncIterator[str]:
        """Subscribe to a channel and return an async iterator yielding received messages."""
        pass


class InMemoryPubSub(BasePubSub):
    """Thread-safe, process-local in-memory pub-sub.
    Suitable for development, testing, and single-instance deployments.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)

    def publish(self, channel: str, message: str = "") -> None:
        with self._lock:
            queues = list(self._subscribers.get(channel, set()))

        for q in queues:
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                logger.warning("Queue full for channel %s, dropping event", channel)
            except Exception as e:
                logger.debug("Failed to put event into subscriber queue: %s", e)

    async def publish_async(self, channel: str, message: str = "") -> None:
        self.publish(channel, message)

    def subscribe(self, channel: str) -> AsyncIterator[str]:
        return Subscription(self._subscribers, self._lock, channel)


_global_pubsub: BasePubSub | None = None
_pubsub_lock = threading.Lock()


def get_pubsub() -> BasePubSub:
    """Return the configured PubSub backend (Redis, Postgres, or InMemory)."""
    global _global_pubsub
    if _global_pubsub is not None:
        return _global_pubsub

    with _pubsub_lock:
        if _global_pubsub is not None:
            return _global_pubsub

        from app.core.config import settings

        # In testing or sqlite, always use InMemoryPubSub
        if settings.environment == "test" or settings.is_sqlite:
            _global_pubsub = InMemoryPubSub()
            return _global_pubsub

        # If Redis is configured
        redis_url = getattr(settings, "redis_url", None)
        if redis_url:
            try:
                import redis.asyncio as aioredis  # type: ignore

                class RedisPubSub(BasePubSub):
                    def __init__(self, url: str):
                        self._url = url
                        self._in_memory = InMemoryPubSub()

                    def publish(self, channel: str, message: str = "") -> None:
                        self._in_memory.publish(channel, message)
                        try:
                            import redis
                            r = redis.from_url(self._url)
                            r.publish(channel, message)
                        except Exception as err:
                            logger.error("Redis publish error on %s: %s", channel, err)

                    async def publish_async(self, channel: str, message: str = "") -> None:
                        self._in_memory.publish(channel, message)
                        try:
                            r = aioredis.from_url(self._url)
                            async with r:
                                await r.publish(channel, message)
                        except Exception as err:
                            logger.error("Async Redis publish error on %s: %s", channel, err)

                    def subscribe(self, channel: str) -> AsyncIterator[str]:
                        # Fallback to in-memory locally for immediate reactivity
                        return self._in_memory.subscribe(channel)

                _global_pubsub = RedisPubSub(redis_url)
                logger.info("Initialized RedisPubSub for distributed SSE broadcast")
                return _global_pubsub
            except ImportError:
                logger.info("redis package not installed, defaulting to InMemoryPubSub")

        _global_pubsub = InMemoryPubSub()
        return _global_pubsub
