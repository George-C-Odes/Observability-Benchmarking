"""Simple dict-backed cache adapter — baseline (no eviction overhead).

Equivalent to ``sliceCache`` / ``mapCache`` in Go.
A plain ``dict`` lookup is an O(1) hash-table probe with zero per-access
overhead (no TTL check, no LRU reordering, no ``time.monotonic()`` syscall).
This makes it the ideal adapter when the cache is populated once at startup
and never mutated — exactly the benchmarking use-case.
"""

from __future__ import annotations

from obbench_django_common.application.port.cache_port import CachePort


class DictCacheAdapter(CachePort):
    """Plain ``dict[str, str]`` cache — fastest baseline with no eviction."""

    __slots__ = ("_data", "_size")

    def __init__(self, max_size: int) -> None:
        self._size = max_size
        self._data: dict[str, str] = {}

    def populate(self) -> None:
        # Dict comprehension is faster than a Python-level for-loop because
        # CPython executes the comprehension in a tighter C loop.
        self._data = {str(i): f"value-{i}" for i in range(1, self._size + 1)}

    def get(self, key: str) -> str:
        return self._data.get(key, "")

    def size(self) -> int:
        return self._size

    def close(self) -> None:
        self._data.clear()
