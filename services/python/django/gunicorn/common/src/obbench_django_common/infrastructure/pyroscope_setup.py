"""Optional Pyroscope span-profile integration.

Configures Pyroscope continuous profiling and enables trace-to-profile
correlation when ``PYROSCOPE_ENABLED=true``.

Reference:
  https://grafana.com/docs/pyroscope/latest/configure-client/trace-span-profiles/python-span-profiles/

When the zero-code OTel agent is active it installs its own TracerProvider.
Pyroscope's ``otel`` integration wraps that provider so that profile samples
are annotated with span IDs, enabling Grafana's Traces → Profiles drill-down.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from obbench_django_common.infrastructure.optional_exceptions import (
    NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS,
)

logger = logging.getLogger("hello")


# noinspection PyMissingConstructor
class _State:
    """Module-level mutable flag — avoids ``global`` statement."""

    configured: bool = False


_PYROSCOPE_LOG_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warn": logging.WARNING,
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL,
    "fatal": logging.CRITICAL,
}


def resolve_pyroscope_logging(raw_level: str | None) -> tuple[bool, int]:
    """Return whether native logging is enabled and which Python level to use."""
    normalized = (raw_level or "warn").strip().lower()
    if normalized in ("off", "none", "false", "0"):
        return False, logging.WARNING

    if normalized in _PYROSCOPE_LOG_LEVELS:
        return True, _PYROSCOPE_LOG_LEVELS[normalized]

    logger.warning("unknown PYROSCOPE_LOG_LEVEL=%r; defaulting to warn", raw_level)
    return True, logging.WARNING


def _resolve_pyroscope_logging(raw_level: str | None) -> tuple[bool, int]:
    """Backward-compatible private alias for ``resolve_pyroscope_logging()``."""
    return resolve_pyroscope_logging(raw_level)


def reset_pyroscope_state() -> None:
    """Clear module-level Pyroscope state for isolated tests."""
    _State.configured = False


def _configure_profiler(pyroscope_module: Any, app_name: str, server_address: str) -> None:
    pyroscope_logging_enabled, pyroscope_logger_level = resolve_pyroscope_logging(
        os.environ.get("PYROSCOPE_LOG_LEVEL", "warn")
    )
    pyroscope_module.LOGGER.setLevel(pyroscope_logger_level)

    pyroscope_module.configure(
        application_name=app_name,
        server_address=server_address,
        enable_logging=pyroscope_logging_enabled,
        tags={
            "service": os.environ.get("OTEL_SERVICE_NAME", "django"),
            "env": "dev",
        },
    )


# noinspection PyProtectedMember
def _register_span_processor() -> bool:
    from opentelemetry import trace  # type: ignore[import-untyped]
    from pyroscope.otel import PyroscopeSpanProcessor  # type: ignore[import-untyped]

    provider = trace.get_tracer_provider()
    # The zero-code agent may wrap the SDK TracerProvider in a Proxy.
    real_provider = getattr(provider, "_real_provider", provider)
    span_processor_adder = getattr(real_provider, "add_span_processor", None)
    if span_processor_adder is None:
        span_processor_adder = getattr(provider, "add_span_processor", None)

    if span_processor_adder is None:
        logger.warning(
            "could not register pyroscope span-processor: TracerProvider has no add_span_processor"
        )
        return False

    span_processor_adder(PyroscopeSpanProcessor())
    return True


def configure_pyroscope() -> None:
    """Start Pyroscope profiling with span-profile correlation if enabled."""
    if _State.configured:
        return
    _State.configured = True

    enabled = os.environ.get("PYROSCOPE_ENABLED", "false").strip().lower() in (
        "true",
        "1",
        "yes",
    )
    if not enabled:
        logger.info(
            "pyroscope disabled (PYROSCOPE_ENABLED=%s)",
            os.environ.get("PYROSCOPE_ENABLED", ""),
        )
        return

    server_address = os.environ.get("PYROSCOPE_SERVER_ADDRESS", "").strip()
    app_name = os.environ.get("PYROSCOPE_APPLICATION_NAME", "").strip()
    if not server_address or not app_name:
        logger.warning(
            "pyroscope enabled but missing PYROSCOPE_SERVER_ADDRESS or PYROSCOPE_APPLICATION_NAME"
        )
        return

    try:
        import pyroscope  # type: ignore[import-untyped]
    except NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS:
        logger.warning("pyroscope setup failed", exc_info=True)
        return

    try:
        _configure_profiler(pyroscope, app_name, server_address)
        logger.info("pyroscope configured: app=%s, server=%s", app_name, server_address)
    except NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS:
        logger.warning("pyroscope setup failed", exc_info=True)
        return  # no point wiring the span processor if the profiler is down

    # --- Trace-to-profile correlation (Traces → Profiles in Grafana) ---
    # Register the official Grafana PyroscopeSpanProcessor (pyroscope-otel).
    # It uses pyroscope.add_thread_tag / remove_thread_tag to label py-spy
    # samples with span_id + span_name, and sets ``pyroscope.profile.id``
    # (= hex span ID) on each root span so Grafana can link to Pyroscope.
    #
    # Reference:
    #   https://github.com/grafana/otel-profiling-python
    #   https://grafana.com/docs/pyroscope/latest/configure-client/trace-span-profiles/python-span-profiles/
    try:
        if _register_span_processor():
            logger.info("pyroscope span-processor registered (trace→profile correlation active)")
    except NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS:
        logger.warning("pyroscope span-processor registration failed", exc_info=True)
