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

logger = logging.getLogger("hello")


class _State:
    """Module-level mutable flag — avoids ``global`` statement."""

    registered = False


def register_metrics() -> None:
    """Register the ``hello.request.count`` observable counter once."""
    if _State.registered:
        return
    _State.registered = True

    # noinspection PyBroadException
    try:
        from collections.abc import Iterable

        from opentelemetry import metrics as otel_metrics

        from obbench_django_common.application.hello_service import get_request_count
        from obbench_django_common.infrastructure.boot import get_app_config

        cfg = get_app_config()

        meter = otel_metrics.get_meter("hello")

        def _observe_request_count(
            _options: otel_metrics.CallbackOptions,
        ) -> Iterable[otel_metrics.Observation]:
            yield otel_metrics.Observation(
                value=get_request_count(),
                attributes={"endpoint": cfg.endpoint_path},
            )

        meter.create_observable_counter(
            name="hello.request.count",
            callbacks=[_observe_request_count],
            description=(
                f"Total number of {cfg.endpoint_path} requests handled by this process"
            ),
        )
        logger.info("registered hello.request.count observable counter")
    except Exception:
        logger.debug(
            "failed to register hello.request.count (OTel SDK may not be active)",
            exc_info=True,
        )