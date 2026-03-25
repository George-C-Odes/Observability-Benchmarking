"""Application service — orchestrates the hello use-case.

Mirrors ``HelloService.java`` and ``handlers/hello.go``:
  1. Increment request counter.
  2. Optional sleep.
  3. Retrieve cached value for key "1".
  4. Return formatted greeting string.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from obbench_django_common.application.port.cache_port import CachePort

logger = logging.getLogger("hello")

# ---------------------------------------------------------------------------
# Request counter — lock-free, per-thread buckets
# ---------------------------------------------------------------------------
# Each thread writes only to its own ``threading.get_ident()`` bucket.
# The GIL guarantees individual dict operations are atomic, so concurrent
# writes to *different* keys are safe without a lock.
# ``get_request_count()`` (called only by the OTel observer, not on the hot
# path) sums all buckets — a momentary read that is "close enough" for
# observable counters.
_thread_counts: dict[int, int] = {}


def _increment_counter() -> None:
    """Increment the per-thread request counter (lock-free hot path)."""
    tid = threading.get_ident()
    try:
        _thread_counts[tid] += 1
    except KeyError:
        _thread_counts[tid] = 1


def get_request_count() -> int:
    """Return the cumulative request count across all threads."""
    return sum(_thread_counts.values())


def reset_request_count() -> None:
    """Reset the request counter after ``fork()`` or between isolated tests."""
    _thread_counts.clear()


def _reset_counter() -> None:
    """Backward-compatible private alias for ``reset_request_count()``."""
    reset_request_count()


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

# Hot-path constant — all benchmark modules read the same pre-populated key.
_CACHE_KEY = "1"


class HelloService:
    """Stateless application service for the benchmark hello endpoint."""

    __slots__ = ("_cache", "_greeting_prefix")

    def __init__(self, cache: CachePort, greeting_prefix: str) -> None:
        self._cache = cache
        self._greeting_prefix = greeting_prefix

    def hello(self, sleep_seconds: int = 0) -> str:
        """Handle a benchmark hello request.

        Returns a JSON-safe string of the form:
        ``Hello from Django <variant> REST value-1``
        """
        _increment_counter()
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)
        value = self._cache.get(_CACHE_KEY)
        return self._greeting_prefix + value
