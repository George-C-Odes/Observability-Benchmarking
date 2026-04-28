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
import sys
from typing import TYPE_CHECKING, Any, Callable

from obbench_django_common.infrastructure.optional_exceptions import (
    NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS,
)

if TYPE_CHECKING:
    from opentelemetry.sdk.resources import Resource

logger = logging.getLogger("hello")

_EXCLUDED_URLS = "/healthz,/readyz,/livez,/hello/healthz,/hello/readyz,/hello/livez"


# noinspection PyMethodMayBeStatic
class _ContextDetachFilter(logging.Filter):
    """Suppress benign 'Failed to detach context' errors from OTel.

    Under ASGI (Uvicorn workers), Python 3.13's stricter ``contextvars``
    causes ``ContextVar.reset(token)`` to raise ``ValueError`` when the
    token was created in a different async ``Context``.  The OTel SDK
    catches this and logs it at ERROR level, but the error is harmless —
    spans are still created and exported correctly.  This filter silences
    the noise.

    The filter is only installed when:
      - the ``OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS`` env var is explicitly
        ``true`` / ``1`` / ``yes``, **or**
      - the runtime is the ASGI variant (``HELLO_VARIANT=reactive``) **and**
        Python ≥ 3.13.

    This avoids hiding genuine context-propagation issues in WSGI
    workers or older Python versions where the error would signal a real
    bug.

    Ref: https://github.com/open-telemetry/opentelemetry-python/issues/4236
    """

    def filter(self, record: logging.LogRecord) -> bool:
        return "Failed to detach context" not in record.getMessage()


# noinspection PyMissingConstructor
class _State:
    """Module-level mutable flags — avoids ``global`` statements."""

    sdk_configured: bool = False
    app_instrumented: bool = False


def _sdk_disabled() -> bool:
    return os.environ.get("OTEL_SDK_DISABLED", "false").strip().lower() in (
        "true",
        "1",
        "yes",
    )


def reset_otel_setup_state() -> None:
    """Reset module-level OTel setup flags for isolated tests."""
    _State.sdk_configured = False
    _State.app_instrumented = False


def _run_optional_otel_step(
    action: Callable[[], None],
    failure_message: str,
    *,
    failure_level: int = logging.DEBUG,
) -> bool:
    """Run an optional OTel integration step without aborting app lifecycle.

    OTel setup, instrumentation, and shutdown touch third-party packages whose
    import/setup behavior varies across environments and versions.  Import,
    capability, and runtime wiring problems should degrade telemetry only;
    unexpected local bootstrap bugs still propagate instead of being swallowed.
    """
    try:
        action()
    except NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS:
        logger.log(failure_level, failure_message, exc_info=True)
        return False
    return True


def _apply_django_instrumentor() -> None:
    from opentelemetry.instrumentation.django import DjangoInstrumentor

    DjangoInstrumentor().instrument(excluded_urls=_EXCLUDED_URLS)


def _apply_logging_instrumentor() -> None:
    from opentelemetry.instrumentation.logging import LoggingInstrumentor

    LoggingInstrumentor().instrument(set_logging_format=True)


def should_suppress_context_detach_errors() -> bool:
    """Decide whether to install ``_ContextDetachFilter``.

    The decision follows this precedence:

    1. If ``OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS`` is explicitly
       ``true`` / ``1`` / ``yes``, suppression is **always enabled**.
    2. If it is explicitly ``false`` / ``0`` / ``no``, suppression is
       **always disabled**, even when running under ASGI on Python ≥ 3.13.
    3. If it is unset or empty, suppression is enabled only when the
       runtime is the ASGI variant (``HELLO_VARIANT=reactive``) **and**
       Python ≥ 3.13 (where the stricter ``contextvars`` triggers the
       benign error).

    In all other cases the filter is **not** installed so that genuine
    context-propagation failures remain visible, and the environment
    variable (when set) always overrides the auto-detection.
    """
    explicit = os.environ.get("OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS", "").strip().lower()
    if explicit in ("true", "1", "yes"):
        return True
    if explicit in ("false", "0", "no"):
        return False

    # Auto-detect: ASGI variant + Python 3.13+
    is_asgi = os.environ.get("HELLO_VARIANT", "platform").strip().lower() == "reactive"
    return is_asgi and sys.version_info >= (3, 13)


def _should_suppress_context_detach_errors() -> bool:
    """Backward-compatible private alias for ``should_suppress_context_detach_errors()``."""
    return should_suppress_context_detach_errors()


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

    if _run_optional_otel_step(
        _apply_django_instrumentor,
        "DjangoInstrumentor unavailable",
    ):
        logger.info("DjangoInstrumentor applied")

    if _run_optional_otel_step(
        _apply_logging_instrumentor,
        "LoggingInstrumentor unavailable",
    ):
        logger.info("LoggingInstrumentor applied (trace context in log records)")


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
    explicit_suppress = os.environ.get("OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS", "").strip().lower()
    if should_suppress_context_detach_errors():
        logging.getLogger("opentelemetry.context").addFilter(_ContextDetachFilter())
        if explicit_suppress in ("true", "1", "yes"):
            reason = "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS=%s" % explicit_suppress
        else:
            reason = "HELLO_VARIANT=%s, Python %s" % (
                os.environ.get("HELLO_VARIANT", "platform"),
                ".".join(map(str, sys.version_info[:3])),
            )
        logger.debug("Installed _ContextDetachFilter (%s)", reason)

    if _run_optional_otel_step(
        _do_configure_sdk,
        "OTel SDK setup failed — telemetry disabled for this worker",
        failure_level=logging.WARNING,
    ):
        logger.info("OTel SDK configured: pid=%d", os.getpid())


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
    _run_optional_otel_step(
        lambda: _configure_log_export(resource),
        "OTel log export not configured",
    )


# noinspection PyProtectedMember
# OTel's logging API still exposes the supported entry points from underscored
# modules (``opentelemetry.sdk._logs`` / ``opentelemetry._logs``), so the IDE's
# protected-member warning is a false positive for the current library surface.
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
        from opentelemetry._logs import set_logger_provider as set_global_logger_provider
    except ImportError:
        set_global_logger_provider = None

    if callable(set_global_logger_provider):
        set_global_logger_provider(logger_provider)

    # Attach OTel LoggingHandler to application loggers so log records
    # are exported via OTLP → Alloy → Loki alongside traces and metrics.
    otel_handler = LoggingHandler(
        level=logging.NOTSET,
        logger_provider=logger_provider,
    )
    for name in ("hello", "django"):
        logging.getLogger(name).addHandler(otel_handler)


def _shutdown_traces_and_metrics() -> None:
    from opentelemetry import metrics, trace

    tp = trace.get_tracer_provider()
    if hasattr(tp, "shutdown"):
        tp.shutdown()
    mp = metrics.get_meter_provider()
    if hasattr(mp, "shutdown"):
        mp.shutdown()


# noinspection PyProtectedMember
# ``opentelemetry._logs`` remains the documented way to retrieve/shutdown the
# global logger provider, despite the underscore prefix in the package name.
def _shutdown_logs() -> None:
    from opentelemetry._logs import get_logger_provider

    lp = get_logger_provider()
    if hasattr(lp, "shutdown"):
        lp.shutdown()


# ---------------------------------------------------------------------------
# Shutdown (worker exit)
# ---------------------------------------------------------------------------


def shutdown_sdk() -> None:
    """Flush pending data and shut down export threads.

    Call from gunicorn's ``worker_exit`` hook to ensure all buffered
    traces, metrics, and logs are exported before the process dies.
    """
    _run_optional_otel_step(
        _shutdown_traces_and_metrics,
        "OTel SDK shutdown error (traces/metrics)",
    )

    _run_optional_otel_step(
        _shutdown_logs,
        "OTel SDK shutdown error (logs)",
    )
