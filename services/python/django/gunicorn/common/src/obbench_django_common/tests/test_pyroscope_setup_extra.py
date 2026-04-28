from __future__ import annotations

import builtins
import os
import sys
import types
from unittest import TestCase, mock

from obbench_django_common.infrastructure import pyroscope_setup


# noinspection PyProtectedMember
# noinspection PyPep8Naming
class PyroscopeSetupExtraTests(TestCase):
    def setUp(self) -> None:
        pyroscope_setup.reset_pyroscope_state()
        self.addCleanup(pyroscope_setup.reset_pyroscope_state)

    def test_configure_pyroscope_logs_disabled_state(self) -> None:
        with (
            mock.patch.dict(os.environ, {"PYROSCOPE_ENABLED": "false"}, clear=False),
            self.assertLogs("hello", level="INFO") as logs,
        ):
            pyroscope_setup.configure_pyroscope()

        self.assertTrue(any("pyroscope disabled" in message for message in logs.output))

    def test_configure_pyroscope_warns_when_required_env_is_missing(self) -> None:
        with (
            mock.patch.dict(os.environ, {"PYROSCOPE_ENABLED": "true"}, clear=False),
            self.assertLogs("hello", level="WARNING") as logs,
        ):
            pyroscope_setup.configure_pyroscope()

        self.assertTrue(
            any("missing PYROSCOPE_SERVER_ADDRESS" in message for message in logs.output)
        )

    def test_configure_pyroscope_logs_warning_when_import_fails(self) -> None:
        real_import = builtins.__import__

        def fake_import(name: str, *args: object, **kwargs: object) -> object:
            if name == "pyroscope":
                raise ImportError("missing")
            return real_import(name, *args, **kwargs)

        with (
            mock.patch.dict(
                os.environ,
                {
                    "PYROSCOPE_ENABLED": "true",
                    "PYROSCOPE_SERVER_ADDRESS": "http://pyroscope:4040",
                    "PYROSCOPE_APPLICATION_NAME": "agent/django-platform",
                },
                clear=False,
            ),
            mock.patch("builtins.__import__", side_effect=fake_import),
            self.assertLogs("hello", level="WARNING") as logs,
        ):
            pyroscope_setup.configure_pyroscope()

        self.assertTrue(any("pyroscope setup failed" in message for message in logs.output))

    def test_configure_pyroscope_logs_warning_when_span_processor_registration_fails(self) -> None:
        pyroscope_module = types.ModuleType("pyroscope")
        pyroscope_module.LOGGER = mock.Mock()
        pyroscope_module.configure = mock.Mock()

        with (
            mock.patch.dict(
                os.environ,
                {
                    "PYROSCOPE_ENABLED": "true",
                    "PYROSCOPE_SERVER_ADDRESS": "http://pyroscope:4040",
                    "PYROSCOPE_APPLICATION_NAME": "agent/django-platform",
                },
                clear=False,
            ),
            mock.patch.dict(sys.modules, {"pyroscope": pyroscope_module}, clear=False),
            mock.patch.object(
                pyroscope_setup,
                "_register_span_processor",
                side_effect=RuntimeError("boom"),
            ),
            self.assertLogs("hello", level="WARNING") as logs,
        ):
            pyroscope_setup.configure_pyroscope()

        self.assertTrue(
            any(
                "pyroscope span-processor registration failed" in message for message in logs.output
            )
        )

    def test_register_span_processor_prefers_real_provider(self) -> None:
        real_provider = mock.Mock()
        proxy_provider = types.SimpleNamespace(_real_provider=real_provider)
        trace_module = types.SimpleNamespace(
            get_tracer_provider=mock.Mock(return_value=proxy_provider)
        )
        pyroscope_otel_module = types.SimpleNamespace(
            PyroscopeSpanProcessor=mock.Mock(return_value="proc")
        )

        with mock.patch.dict(
            sys.modules,
            {
                "opentelemetry": types.ModuleType("opentelemetry"),
                "opentelemetry.trace": trace_module,
                "pyroscope.otel": pyroscope_otel_module,
            },
            clear=False,
        ):
            sys.modules["opentelemetry"].trace = trace_module
            result = pyroscope_setup._register_span_processor()

        self.assertTrue(result)
        real_provider.add_span_processor.assert_called_once_with("proc")

    def test_register_span_processor_falls_back_to_proxy_provider_and_warns_without_adder(
        self,
    ) -> None:
        provider = mock.Mock()
        provider._real_provider = object()
        trace_module = types.SimpleNamespace(get_tracer_provider=mock.Mock(return_value=provider))
        pyroscope_otel_module = types.SimpleNamespace(
            PyroscopeSpanProcessor=mock.Mock(return_value="proc")
        )

        with mock.patch.dict(
            sys.modules,
            {
                "opentelemetry": types.ModuleType("opentelemetry"),
                "opentelemetry.trace": trace_module,
                "pyroscope.otel": pyroscope_otel_module,
            },
            clear=False,
        ):
            sys.modules["opentelemetry"].trace = trace_module
            result = pyroscope_setup._register_span_processor()

        self.assertTrue(result)
        provider.add_span_processor.assert_called_once_with("proc")

        provider_without_adder = types.SimpleNamespace(_real_provider=object())
        trace_module = types.SimpleNamespace(
            get_tracer_provider=mock.Mock(return_value=provider_without_adder)
        )

        with (
            mock.patch.dict(
                sys.modules,
                {
                    "opentelemetry": types.ModuleType("opentelemetry"),
                    "opentelemetry.trace": trace_module,
                    "pyroscope.otel": pyroscope_otel_module,
                },
                clear=False,
            ),
            self.assertLogs("hello", level="WARNING") as logs,
        ):
            sys.modules["opentelemetry"].trace = trace_module
            missing_result = pyroscope_setup._register_span_processor()

        self.assertFalse(missing_result)
        self.assertTrue(
            any("could not register pyroscope span-processor" in message for message in logs.output)
        )
