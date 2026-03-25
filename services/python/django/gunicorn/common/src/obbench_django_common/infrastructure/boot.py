"""Startup / bootstrap logic — wires dependencies together.

Called once from ``HelloConfig.ready()`` (Django app startup hook).
Mirrors ``main.go`` wiring and Spring ``@Configuration`` bean creation.

With ``preload_app = True`` (gunicorn), this module's ``on_startup()`` runs
in the **master** process.  The 50 000-entry cache is populated once and
shared with forked workers via copy-on-write.

**OTel SDK initialization is ALWAYS deferred to ``post_fork_init()``**
because background export threads (PeriodicExportingMetricReader,
BatchSpanProcessor, BatchLogRecordProcessor) do not survive ``fork()``.
Only the instrumentation patches (DjangoInstrumentor, LoggingInstrumentor)
are applied in the master — they use Proxy providers that delegate to
whatever real provider each worker sets later.

Per-worker state (request counter, OTel SDK, custom metrics, Pyroscope)
is initialized by ``post_fork_init()`` called from the gunicorn
``post_fork`` hook.  In standalone mode (no gunicorn), ``on_startup()``
handles everything.
"""

from __future__ import annotations

import logging
import os
import platform
import sys
from typing import TYPE_CHECKING

from obbench_django_common.application.hello_service import HelloService
from obbench_django_common.infrastructure.cache.factory import create_cache
from obbench_django_common.infrastructure.config import AppConfig, load_config

if TYPE_CHECKING:
    from obbench_django_common.application.port.cache_port import CachePort

logger = logging.getLogger("hello")


class _State:
    """Module-level singletons (one per worker process) — avoids ``global`` statements."""

    cache: CachePort | None = None
    config: AppConfig | None = None
    hello_service: HelloService | None = None
    booted: bool = False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def on_startup() -> None:
    """Eagerly initialize the cache and service objects.

    When ``preload_app = True``, this runs in the **master** process.
    The cache data is read-only and safely shared via COW after fork.

    OTel SDK initialization is **not** done here — it is deferred to
    ``post_fork_init()`` so each worker gets its own providers with
    live export threads and fresh gRPC channels.

    Only the instrumentation patches (Django, logging) are applied here
    because they modify class-level code that survives ``fork()`` and
    use OTel Proxy providers that delegate to whatever real provider
    each worker sets later.

    In standalone mode (no gunicorn), OTel is also initialized here.
    """
    if _State.booted:
        return
    _State.booted = True

    cfg = load_config()
    _State.config = cfg

    logger.info(
        (
            "boot: variant=%s, endpoint=%s, cache_size=%d, cache_impl=%s, "
            "python=%s, platform=%s, pid=%d"
        ),
        cfg.hello_variant,
        cfg.endpoint_path,
        cfg.cache_size,
        cfg.cache_impl,
        platform.python_version(),
        platform.platform(),
        os.getpid(),
    )

    _State.cache = create_cache(cfg.cache_size, cfg.cache_impl)
    _State.hello_service = HelloService(_State.cache, greeting_prefix=cfg.greeting_prefix)

    logger.info(
        "cache populated: impl=%s, size=%d",
        cfg.cache_impl,
        _State.cache.size(),
    )

    # Apply instrumentation patches (DjangoInstrumentor, LoggingInstrumentor).
    # These survive fork() and use Proxy providers.
    _instrument_app()

    # Under gunicorn, post_fork_init() handles per-worker OTel SDK setup.
    # In standalone mode (no gunicorn), initialize everything here.
    if "gunicorn" not in sys.modules:
        _init_observability()


def post_fork_init() -> None:
    """Per-worker re-initialization after ``fork()`` (preload_app = True).

    Called from the gunicorn ``post_fork`` hook.  The cache and
    ``HelloService`` are inherited from the master via COW — we only
    re-initialize the * per-worker * mutable state:
      * request counter → 0
      * OTel SDK        → fresh providers with live export threads
      * OTel metrics    → per-process observable counter
      * Pyroscope       → per-process profiling agent

    Note: we do NOT reset ``otel_metrics._registered`` or
    ``pyroscope_setup._configured`` flags here — they are already
    ``False`` because those functions were never called in the master.
    Each worker's ``_init_observability()`` call sets them to ``True``
    exactly once.  This eliminates the previous bug where resetting
    flags after fork caused duplicate observable-counter registrations.
    """
    # Reset the per-worker request counter.
    from obbench_django_common.application.hello_service import reset_request_count

    reset_request_count()

    _init_observability()

    logger.info("worker ready: pid=%d", os.getpid())


def get_hello_service() -> HelloService:
    """Return the singleton ``HelloService`` (creates lazily if needed)."""
    if _State.hello_service is None:
        on_startup()
    assert _State.hello_service is not None  # noqa: S101
    return _State.hello_service


def get_app_config() -> AppConfig:
    """Return the cached application config, initializing it if required."""
    if _State.config is None:
        on_startup()
    assert _State.config is not None  # noqa: S101
    return _State.config


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _instrument_app() -> None:
    """Apply OTel instrumentation patches (Django, logging).

    These patches survive ``fork()`` and use Proxy providers.

    ``otel_setup.instrument_app()`` already treats missing/optional vendor
    instrumentation as non-fatal, so we delegate directly here and let any
    unexpected local bug propagate instead of hiding it.
    """
    from obbench_django_common.infrastructure.otel_setup import instrument_app

    instrument_app()


def _init_observability() -> None:
    """Initialize per-worker OTel SDK, custom metrics, and Pyroscope.

    Each delegated helper already implements best-effort handling for optional
    observability dependencies and may catch and log its own failures.  This
    wrapper adds no additional try/except, so errors raised at this level
    (for example, bad imports or incorrect call ordering) will still surface,
    while leaving the helpers' internal error-handling behavior unchanged.
    """
    from obbench_django_common.infrastructure.otel_metrics import register_metrics
    from obbench_django_common.infrastructure.otel_setup import configure_sdk
    from obbench_django_common.infrastructure.pyroscope_setup import configure_pyroscope

    configure_sdk()
    register_metrics()
    configure_pyroscope()
