"""Custom OpenTelemetry metrics registration.

Registers the ``hello.request.count`` observable counter — the same custom
metric published by the Java and Go services.

This module is called from ``_init_observability()`` in the ``post_fork``
hook — AFTER ``otel_setup.configure_sdk()`` has set a real MeterProvider
with live export threads.  It is **never** called in the master process,
ensuring no duplicate counter registrations survive ``fork()``.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from obbench_django_common.infrastructure.optional_exceptions import (
    NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS,
)

logger = logging.getLogger("hello")
_registered = False


def reset_otel_metrics_state() -> None:
    """Reset metrics registration state for isolated tests."""
    global _registered

    _registered = False


def register_metrics() -> None:
    """Register the ``hello.request.count`` observable counter once."""
    global _registered

    if _registered:
        return

    try:
        from opentelemetry import metrics as otel_metrics

        from obbench_django_common.application.hello_service import get_request_count
        from obbench_django_common.infrastructure.boot import get_app_config

        cfg = get_app_config()

        meter = otel_metrics.get_meter("hello")

        def _observe_request_count(_options: Any) -> Iterable[Any]:
            yield otel_metrics.Observation(
                value=get_request_count(),
                attributes={"endpoint": cfg.endpoint_path},
            )

        meter.create_observable_counter(
            name="hello.request.count",
            callbacks=[_observe_request_count],
            description=f"Total number of {cfg.endpoint_path} requests handled by this process",
        )
    except NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS:
        logger.debug(
            "failed to register hello.request.count (OTel SDK may not be active)",
            exc_info=True,
        )
        return

    _registered = True
    logger.info("registered hello.request.count observable counter")
