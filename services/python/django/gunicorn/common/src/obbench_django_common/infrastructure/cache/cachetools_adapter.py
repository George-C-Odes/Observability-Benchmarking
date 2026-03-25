"""cachetools TTL/LRU cache adapter — pure-Python, fork-safe.

Replaces the Rust-based ``theine`` adapter which causes SIGSEGV in
Gunicorn forked workers on Python 3.14 (no pre-built wheel).

``cachetools.TTLCache`` combines LRU eviction with per-item TTL,
making it the closest pure-Python equivalent to Caffeine / theine-go.

Library: https://github.com/tkem/cachetools
"""

from __future__ import annotations

from cachetools import TTLCache

from obbench_django_common.application.port.cache_port import CachePort

# 24 hours in seconds — matches Caffeine / theine-go ``expireAfterWrite``.
_DEFAULT_TTL = 86_400


class CachetoolsAdapter(CachePort):
    """Adapter that wraps ``cachetools.TTLCache`` behind the ``CachePort`` interface."""

    __slots__ = ("_cache", "_size")

    def __init__(self, max_size: int) -> None:
        self._size = max_size
        self._cache: TTLCache[str, str] = TTLCache(maxsize=max_size, ttl=_DEFAULT_TTL)

    # -- Pre-population (called once at boot) --------------------------------

    def populate(self) -> None:
        """Fill the cache with keys ``"1"`` … ``"<size>"`` → ``"value-<i>"``."""
        for i in range(self._size, 0, -1):
            self._cache[str(i)] = f"value-{i}"

    # -- CachePort implementation --------------------------------------------

    def get(self, key: str) -> str:
        val = self._cache.get(key)
        return val if val is not None else ""

    def size(self) -> int:
        return self._size

    def close(self) -> None:
        self._cache.clear()
