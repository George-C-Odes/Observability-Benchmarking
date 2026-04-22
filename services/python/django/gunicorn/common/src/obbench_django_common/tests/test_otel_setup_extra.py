from __future__ import annotations

import logging
import os
import sys
import types
from typing import TYPE_CHECKING, Any, cast
from unittest import TestCase, mock

from obbench_django_common.infrastructure import otel_setup

if TYPE_CHECKING:
    from opentelemetry.sdk.resources import Resource


class OTelSetupExtraTests(TestCase):
    def setUp(self) -> None:
        otel_setup.reset_otel_setup_state()
        self.addCleanup(otel_setup.reset_otel_setup_state)

    def test_sdk_disabled_and_optional_step_helpers_cover_success_and_nonfatal_failures(
        self,
    ) -> None:
        with mock.patch.dict(os.environ, {"OTEL_SDK_DISABLED": "yes"}, clear=False):
            self.assertTrue(otel_setup._sdk_disabled())

        action = mock.Mock(side_effect=RuntimeError("boom"))

        with self.assertLogs("hello", level="DEBUG") as logs:
            result = otel_setup._run_optional_otel_step(action, "optional step failed")

        self.assertFalse(result)
        self.assertTrue(any("optional step failed" in message for message in logs.output))
        self.assertTrue(otel_setup._run_optional_otel_step(mock.Mock(), "unused"))

    @staticmethod
    def test_apply_instrumentor_helpers_import_and_invoke_expected_methods() -> None:
        django_instrumentor = mock.Mock()
        logging_instrumentor = mock.Mock()
        modules = {
            "opentelemetry.instrumentation.django": types.SimpleNamespace(
                DjangoInstrumentor=mock.Mock(return_value=django_instrumentor)
            ),
            "opentelemetry.instrumentation.logging": types.SimpleNamespace(
                LoggingInstrumentor=mock.Mock(return_value=logging_instrumentor)
            ),
        }

        with mock.patch.dict(sys.modules, modules, clear=False):
            otel_setup._apply_django_instrumentor()
            otel_setup._apply_logging_instrumentor()

        django_instrumentor.instrument.assert_called_once_with(
            excluded_urls=otel_setup._EXCLUDED_URLS
        )
        logging_instrumentor.instrument.assert_called_once_with(set_logging_format=True)

    def test_instrument_app_and_configure_sdk_skip_when_disabled(self) -> None:
        with (
            mock.patch.dict(os.environ, {"OTEL_SDK_DISABLED": "true"}, clear=False),
            mock.patch.object(otel_setup, "_apply_django_instrumentor") as django_inst,
            mock.patch.object(otel_setup, "_apply_logging_instrumentor") as logging_inst,
            self.assertLogs("hello", level="INFO") as logs,
        ):
            otel_setup.instrument_app()
            otel_setup.configure_sdk()

        django_inst.assert_not_called()
        logging_inst.assert_not_called()
        self.assertTrue(
            any("OTel app instrumentation skipped" in message for message in logs.output)
        )
        self.assertTrue(any("OTel SDK setup skipped" in message for message in logs.output))

    def test_configure_sdk_installs_context_filter_and_is_idempotent(self) -> None:
        context_logger = mock.Mock()
        real_get_logger = logging.getLogger

        def fake_get_logger(name: str) -> logging.Logger | mock.Mock:
            if name == "opentelemetry.context":
                return context_logger
            return real_get_logger(name)

        with (
            mock.patch.dict(
                os.environ,
                {
                    "OTEL_SDK_DISABLED": "false",
                    "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "true",
                },
                clear=False,
            ),
            mock.patch.object(otel_setup, "_do_configure_sdk") as do_configure_sdk,
            mock.patch.object(logging, "getLogger", side_effect=fake_get_logger),
            self.assertLogs("hello", level="DEBUG") as logs,
        ):
            otel_setup.configure_sdk()
            otel_setup.configure_sdk()

        do_configure_sdk.assert_called_once_with()
        context_logger.addFilter.assert_called_once()
        self.assertTrue(any("Installed _ContextDetachFilter" in message for message in logs.output))
        self.assertTrue(any("OTel SDK configured" in message for message in logs.output))

    def test_wrap_asgi_application_returns_original_application(self) -> None:
        application = object()
        self.assertIs(application, otel_setup.wrap_asgi_application(application))

    @staticmethod
    def test_do_configure_sdk_wires_tracing_metrics_and_log_export() -> None:
        trace_api = types.SimpleNamespace(set_tracer_provider=mock.Mock())
        metrics_api = types.SimpleNamespace(set_meter_provider=mock.Mock())
        resource = object()
        resource_cls = types.SimpleNamespace(create=mock.Mock(return_value=resource))
        tracer_provider = mock.Mock()
        meter_provider = mock.Mock()
        batch_span_processor = object()
        metric_reader = object()

        modules = {
            "opentelemetry": types.ModuleType("opentelemetry"),
            "opentelemetry.trace": trace_api,
            "opentelemetry.metrics": metrics_api,
            "opentelemetry.exporter.otlp.proto.grpc.metric_exporter": types.SimpleNamespace(
                OTLPMetricExporter=mock.Mock(return_value="metric-exporter")
            ),
            "opentelemetry.exporter.otlp.proto.grpc.trace_exporter": types.SimpleNamespace(
                OTLPSpanExporter=mock.Mock(return_value="span-exporter")
            ),
            "opentelemetry.sdk.metrics": types.SimpleNamespace(
                MeterProvider=mock.Mock(return_value=meter_provider)
            ),
            "opentelemetry.sdk.metrics.export": types.SimpleNamespace(
                PeriodicExportingMetricReader=mock.Mock(return_value=metric_reader)
            ),
            "opentelemetry.sdk.resources": types.SimpleNamespace(Resource=resource_cls),
            "opentelemetry.sdk.trace": types.SimpleNamespace(
                TracerProvider=mock.Mock(return_value=tracer_provider)
            ),
            "opentelemetry.sdk.trace.export": types.SimpleNamespace(
                BatchSpanProcessor=mock.Mock(return_value=batch_span_processor)
            ),
        }

        modules["opentelemetry"].trace = trace_api
        modules["opentelemetry"].metrics = metrics_api

        with (
            mock.patch.dict(sys.modules, modules, clear=False),
            mock.patch.object(otel_setup, "_configure_log_export") as configure_log_export,
            mock.patch.object(otel_setup.os, "getpid", return_value=2468),
        ):
            otel_setup._do_configure_sdk()

        resource_cls.create.assert_called_once_with({"process.pid": 2468})
        tracer_provider.add_span_processor.assert_called_once_with(batch_span_processor)
        trace_api.set_tracer_provider.assert_called_once_with(tracer_provider)
        metrics_api.set_meter_provider.assert_called_once_with(meter_provider)
        configure_log_export.assert_called_once_with(resource)

    @staticmethod
    def test_configure_log_export_attaches_handlers_and_sets_global_provider() -> None:
        logger_provider = mock.Mock()
        batch_log_record_processor = object()
        otel_handler = object()
        hello_logger = mock.Mock()
        django_logger = mock.Mock()
        resource: Resource = cast(Any, mock.Mock())

        modules = {
            "opentelemetry.exporter.otlp.proto.grpc._log_exporter": types.SimpleNamespace(
                OTLPLogExporter=mock.Mock(return_value="log-exporter")
            ),
            "opentelemetry.sdk._logs": types.SimpleNamespace(
                LoggerProvider=mock.Mock(return_value=logger_provider),
                LoggingHandler=mock.Mock(return_value=otel_handler),
            ),
            "opentelemetry.sdk._logs.export": types.SimpleNamespace(
                BatchLogRecordProcessor=mock.Mock(return_value=batch_log_record_processor)
            ),
            "opentelemetry._logs": types.SimpleNamespace(set_logger_provider=mock.Mock()),
        }

        def fake_get_logger(name: str) -> mock.Mock:
            if name == "hello":
                return hello_logger
            if name == "django":
                return django_logger
            raise AssertionError(f"unexpected logger name: {name}")

        with (
            mock.patch.dict(sys.modules, modules, clear=False),
            mock.patch.object(logging, "getLogger", side_effect=fake_get_logger),
        ):
            otel_setup._configure_log_export(resource)  # type: ignore[arg-type]

        logger_provider.add_log_record_processor.assert_called_once_with(batch_log_record_processor)
        modules["opentelemetry._logs"].set_logger_provider.assert_called_once_with(logger_provider)
        hello_logger.addHandler.assert_called_once_with(otel_handler)
        django_logger.addHandler.assert_called_once_with(otel_handler)

    @staticmethod
    def test_shutdown_helpers_call_provider_shutdown_when_available() -> None:
        tracer_provider = mock.Mock()
        meter_provider = mock.Mock()
        logger_provider = mock.Mock()
        modules = {
            "opentelemetry": types.ModuleType("opentelemetry"),
            "opentelemetry.trace": types.SimpleNamespace(
                get_tracer_provider=mock.Mock(return_value=tracer_provider)
            ),
            "opentelemetry.metrics": types.SimpleNamespace(
                get_meter_provider=mock.Mock(return_value=meter_provider)
            ),
            "opentelemetry._logs": types.SimpleNamespace(
                get_logger_provider=mock.Mock(return_value=logger_provider)
            ),
        }
        modules["opentelemetry"].trace = modules["opentelemetry.trace"]
        modules["opentelemetry"].metrics = modules["opentelemetry.metrics"]

        with mock.patch.dict(sys.modules, modules, clear=False):
            otel_setup._shutdown_traces_and_metrics()
            otel_setup._shutdown_logs()

        tracer_provider.shutdown.assert_called_once_with()
        meter_provider.shutdown.assert_called_once_with()
        logger_provider.shutdown.assert_called_once_with()
