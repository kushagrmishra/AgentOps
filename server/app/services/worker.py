from __future__ import annotations

import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

__all__ = ["WorkerPool"]


class WorkerPool:
    """A thread pool that is created on first use and can be reopened.

    Runs and eval suites are long and IO-bound, so they execute off the request
    thread. A plain module-level ThreadPoolExecutor would work, except
    `shutdown()` is permanent: once the API's lifespan closes it, a later startup
    in the same process (tests, or an in-process reload) could never submit
    again. Opening lazily makes shutdown reversible.
    """

    def __init__(self, *, max_workers: int, thread_name_prefix: str) -> None:
        self._max_workers = max_workers
        self._thread_name_prefix = thread_name_prefix
        self._executor: ThreadPoolExecutor | None = None
        self._lock = threading.Lock()

    def submit(self, fn: Callable[..., Any], *args: Any) -> None:
        with self._lock:
            if self._executor is None:
                self._executor = ThreadPoolExecutor(
                    max_workers=self._max_workers, thread_name_prefix=self._thread_name_prefix
                )
            self._executor.submit(fn, *args)

    def shutdown(self) -> None:
        with self._lock:
            executor, self._executor = self._executor, None
        if executor is not None:
            # Queued-but-unstarted work is dropped; in-flight runs finish on their
            # own thread and commit their own state.
            executor.shutdown(wait=False, cancel_futures=True)
