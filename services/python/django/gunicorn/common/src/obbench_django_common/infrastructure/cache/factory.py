"""Cache factory — creates and pre-populates the cache adapter.

Mirrors ``cache.New()`` in Go and the ``@Bean caffeineCache(...)`` in Java.
"""

from __future__ import annotations

from obbench_django_common.application.port.cache_port import CachePort
from obbench_django_common.infrastructure.cache.cachetools_adapter import CachetoolsAdapter
from obbench_django_common.infrastructure.cache.dict_adapter import DictCacheAdapter


def create_cache(size: int, impl: str) -> CachePort:
    """Create, pre-populate, and return a ``CachePort`` implementation.

    Supported *impl* values:
    - ``"cachetools"`` — TTL/LRU cache (pure-Python, fork-safe, **default**)
    - ``"dict"``       — plain ``dict`` baseline (no eviction)
    """
    impl = (impl or "cachetools").strip().lower()

    adapter: CachetoolsAdapter | DictCacheAdapter
    if impl in ("cachetools", "theine"):
        adapter = CachetoolsAdapter(size)
    elif impl in ("dict", "map"):
        adapter = DictCacheAdapter(size)
    else:
        raise ValueError(
            f"Unknown CACHE_IMPL {impl!r} (supported: cachetools, dict)"
        )

    adapter.populate()
    return adapter