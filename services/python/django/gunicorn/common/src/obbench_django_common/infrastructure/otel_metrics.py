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
from typing import TYPE_CHECKING

from obbench_django_common.infrastructure.optional_exceptions import (
    NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS,
)

if TYPE_CHECKING:
    from collections.abc import Iterable

    from opentelemetry.metrics import CallbackOptions, Observation

logger = logging.getLogger("hello")


# noinspection PyMissingConstructor
class _State:
    """Module-level mutable flag — avoids ``global`` statement."""

    registered = False


def reset_otel_metrics_state() -> None:
    """Reset metrics registration state for isolated tests."""
    _State.registered = False


def register_metrics() -> None:
    """Register the ``hello.request.count`` observable counter once."""
    if _State.registered:
        return

    try:
        from opentelemetry import metrics as otel_metrics

        from obbench_django_common.application.hello_service import get_request_count
        from obbench_django_common.infrastructure.boot import get_app_config

        cfg = get_app_config()

        meter = otel_metrics.get_meter("hello")

        def _observe_request_count(_options: CallbackOptions) -> Iterable[Observation]:
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

    _State.registered = True
    logger.info("registered hello.request.count observable counter")
