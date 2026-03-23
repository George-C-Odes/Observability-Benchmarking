"""Programmatic OpenTelemetry SDK setup — one SDK instance per gunicorn worker.

Why programmatic instead of ``opentelemetry-instrument``?
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
The zero-code ``opentelemetry-instrument`` CLI configures the OTel SDK
(TracerProvider, MeterProvider, LoggerProvider with background export
threads) in the **master** process.  When gunicorn forks workers with
``preload_app = True``, daemon threads (PeriodicExportingMetricReader,
BatchSpanProcessor, BatchLogRecordProcessor) do **not** survive
``fork()``, leaving workers with dead exporters and stale gRPC channels.

Observable effects of the bug:
  - ``hello_request_count_total`` appeared to keep incrementing long
    after the benchmark finished (stale / retried OTLP exports).
  - Duplicate observable-counter registrations (one inherited from
    master, one re-registered in worker) caused double-counting.

Fix applied here:
  - **No SDK in the master.**  Each worker creates its own
    ``TracerProvider``, ``MeterProvider``, ``LoggerProvider`` with live
    export threads and fresh gRPC channels in ``post_fork``.
  - Instrumentation patches (``DjangoInstrumentor``,
    ``LoggingInstrumentor``) are applied once in the master — they
    modify class/module-level code that survives ``fork()`` and use
    OTel Proxy providers that delegate to whatever real provider each
    worker sets later.

References:
  https://opentelemetry.io/docs/zero-code/python/
  https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/django/django.html
  https://github.com/open-telemetry/opentelemetry-python-contrib/tree/main/instrumentation/opentelemetry-instrumentation-django
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from opentelemetry.sdk.resources import Resource

logger = logging.getLogger("hello")

_EXCLUDED_URLS = "/healthz,/readyz,/livez,/hello/healthz,/hello/readyz,/hello/livez"


class _ContextDetachFilter(logging.Filter):
    """Suppress benign 'Failed to detach context' errors from OTel.

    Under ASGI (Uvicorn workers), Python 3.13's stricter ``contextvars``
    causes ``ContextVar.reset(token)`` to raise ``ValueError`` when the
    token was created in a different async ``Context``.  The OTel SDK
    catches this and logs it at ERROR level, but the error is harmless —
    spans are still created and exported correctly.  This filter silences
    the noise.

    Ref: https://github.com/open-telemetry/opentelemetry-python/issues/4236
    """

    def filter(self, record: logging.LogRecord) -> bool:
        return "Failed to detach context" not in record.getMessage()


class _State:
    """Module-level mutable flags — avoids ``global`` statements."""

    sdk_configured = False
    app_instrumented = False


def _sdk_disabled() -> bool:
    return os.environ.get("OTEL_SDK_DISABLED", "false").strip().lower() in (
        "true",
        "1",
        "yes",
    )


# ---------------------------------------------------------------------------
# Instrumentation (master — survives fork)
# ---------------------------------------------------------------------------

def instrument_app() -> None:
    """Patch Django and stdlib logging for OTel tracing.

    Call **once** in the master process (from ``on_startup``).

    These patches modify class/module-level code and survive ``fork()``.
    They use OTel ``ProxyTracer`` / ``ProxyMeter`` which automatically
    delegate to whatever real provider is set per-worker later via
    ``configure_sdk()``.
    """
    if _State.app_instrumented:
        return
    if _sdk_disabled():
        logger.info("OTel app instrumentation skipped (OTEL_SDK_DISABLED=true)")
        _State.app_instrumented = True
        return
    _State.app_instrumented = True

    # noinspection PyBroadException
    try:
        from opentelemetry.instrumentation.django import DjangoInstrumentor

        DjangoInstrumentor().instrument(excluded_urls=_EXCLUDED_URLS)
        logger.info("DjangoInstrumentor applied")
    except Exception:
        logger.debug("DjangoInstrumentor unavailable", exc_info=True)

    # noinspection PyBroadException
    try:
        from opentelemetry.instrumentation.logging import LoggingInstrumentor

        LoggingInstrumentor().instrument(set_logging_format=True)
        logger.info("LoggingInstrumentor applied (trace context in log records)")
    except Exception:
        logger.debug("LoggingInstrumentor unavailable", exc_info=True)


def wrap_asgi_application(application: Any) -> Any:
    """Return the ASGI application unchanged (no additional wrapping needed).

    ``DjangoInstrumentor`` (applied in ``instrument_app()``) already adds
    ASGI-aware tracing middleware inside Django's middleware stack.  An
    additional ``OpenTelemetryMiddleware`` wrapper here created **double
    instrumentation**: two nested ``use_span()`` calls each attaching and
    detaching ``contextvars`` tokens.

    Under Python 3.13 the stricter ``ContextVar.reset()`` raised
    ``ValueError("was created in a different Context")`` whenever the
    async event loop resumed a coroutine in a different context copy —
    producing the repeated "Failed to detach context" ERROR log (benign,
    but noisy — up to 41 occurrences per benchmark run).

    Removing the extra layer eliminates the primary trigger.  A logging
    filter (``_ContextDetachFilter``) is also installed as a safety net
    for any remaining edge-case occurrences.
    """
    return application


# ---------------------------------------------------------------------------
# SDK setup (per-worker — must run AFTER fork)
# ---------------------------------------------------------------------------

def configure_sdk() -> None:
    """Create per-worker OTel SDK providers with live export threads.

    Reads all standard ``OTEL_*`` environment variables (endpoint,
    intervals, batch sizes, sampler, resource attributes, etc.).

    Idempotent — second call in the same process is a no-op.
    """
    if _State.sdk_configured:
        return
    if _sdk_disabled():
        logger.info("OTel SDK setup skipped (OTEL_SDK_DISABLED=true)")
        _State.sdk_configured = True
        return
    _State.sdk_configured = True

    # Suppress benign "Failed to detach context" noise that can still
    # occur under ASGI + Python 3.13 (see _ContextDetachFilter docstring).
    logging.getLogger("opentelemetry.context").addFilter(_ContextDetachFilter())

    # noinspection PyBroadException
    try:
        _do_configure_sdk()
        logger.info("OTel SDK configured: pid=%d", os.getpid())
    except Exception:
        logger.warning(
            "OTel SDK setup failed — telemetry disabled for this worker",
            exc_info=True,
        )


def _do_configure_sdk() -> None:
    """Internal — heavy imports and provider wiring."""
    from opentelemetry import metrics, trace
    from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
        OTLPMetricExporter,
    )
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
        OTLPSpanExporter,
    )
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    # Resource — auto-reads OTEL_SERVICE_NAME + OTEL_RESOURCE_ATTRIBUTES.
    # Add process.pid so each worker produces a distinct metric series.
    resource = Resource.create({"process.pid": os.getpid()})

    # --- Traces ---
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter()),  # reads OTEL_BSP_* env vars
    )
    trace.set_tracer_provider(tracer_provider)

    # --- Metrics ---
    reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(),  # reads OTEL_METRIC_EXPORT_INTERVAL env var
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
    metrics.set_meter_provider(meter_provider)

    # --- Logs (optional — fail gracefully) ---
    # noinspection PyBroadException
    try:
        _configure_log_export(resource)
    except Exception:
        logger.debug("OTel log export not configured", exc_info=True)


# noinspection PyProtectedMember
def _configure_log_export(resource: Resource) -> None:
    """Set up OTLP log export and attach ``LoggingHandler`` to app loggers.

    Note: ``opentelemetry.sdk._logs`` and ``opentelemetry._logs`` use an
    underscore prefix because the OTel Python logging API was marked
    "experimental".  These are the documented public entry-points.
    """
    from opentelemetry.exporter.otlp.proto.grpc._log_exporter import (
        OTLPLogExporter,
    )
    from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(OTLPLogExporter()),  # reads OTEL_BLRP_* env vars
    )

    # Set the global LoggerProvider.
    try:
        from opentelemetry._logs import set_logger_provider
    except ImportError:
        set_logger_provider = None  # type: ignore[assignment]

    if set_logger_provider is not None:
        set_logger_provider(logger_provider)

    # Attach OTel LoggingHandler to application loggers so log records
    # are exported via OTLP → Alloy → Loki alongside traces and metrics.
    otel_handler = LoggingHandler(
        level=logging.NOTSET,
        logger_provider=logger_provider,
    )
    for name in ("hello", "django"):
        logging.getLogger(name).addHandler(otel_handler)


# ---------------------------------------------------------------------------
# Shutdown (worker exit)
# ---------------------------------------------------------------------------

# noinspection PyProtectedMember
def shutdown_sdk() -> None:
    """Flush pending data and shut down export threads.

    Call from gunicorn's ``worker_exit`` hook to ensure all buffered
    traces, metrics, and logs are exported before the process dies.
    """
    # noinspection PyBroadException
    try:
        from opentelemetry import metrics, trace

        tp = trace.get_tracer_provider()
        if hasattr(tp, "shutdown"):
            tp.shutdown()
        mp = metrics.get_meter_provider()
        if hasattr(mp, "shutdown"):
            mp.shutdown()
    except Exception:
        logger.debug("OTel SDK shutdown error (traces/metrics)", exc_info=True)

    # noinspection PyBroadException
    try:
        from opentelemetry._logs import get_logger_provider

        lp = get_logger_provider()
        if hasattr(lp, "shutdown"):
            lp.shutdown()
    except Exception:
        logger.debug("OTel SDK shutdown error (logs)", exc_info=True)

