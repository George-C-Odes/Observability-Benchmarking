from __future__ import annotations

import builtins
import os
import sys
import types
from collections.abc import Iterator
from contextlib import contextmanager
from unittest import TestCase, mock

from obbench_django_common.infrastructure import pyroscope_setup


@contextmanager
def _mock_span_processor_imports(provider: object) -> Iterator[mock.Mock]:
    trace_module = types.SimpleNamespace(get_tracer_provider=mock.Mock(return_value=provider))
    opentelemetry_module = types.ModuleType("opentelemetry")
    opentelemetry_module.trace = trace_module
    processor_constructor = mock.Mock(return_value="proc")
    pyroscope_otel_module = types.SimpleNamespace(PyroscopeSpanProcessor=processor_constructor)
    with mock.patch.dict(
        sys.modules,
        {
            "opentelemetry": opentelemetry_module,
            "opentelemetry.trace": trace_module,
            "pyroscope.otel": pyroscope_otel_module,
        },
        clear=False,
    ):
        yield processor_constructor


class PyroscopeSetupExtraTests(TestCase):
    def reset_pyroscope_for_test(self) -> None:
        pyroscope_setup.reset_pyroscope_state()
        self.addCleanup(pyroscope_setup.reset_pyroscope_state)

    def test_configure_pyroscope_logs_disabled_state(self) -> None:
        self.reset_pyroscope_for_test()
        with (
            mock.patch.dict(os.environ, {"PYROSCOPE_ENABLED": "false"}, clear=False),
            self.assertLogs("hello", level="INFO") as logs,
        ):
            pyroscope_setup.configure_pyroscope()

        self.assertTrue(any("pyroscope disabled" in message for message in logs.output))

    def test_configure_pyroscope_warns_when_required_env_is_missing(self) -> None:
        self.reset_pyroscope_for_test()
        with (
            mock.patch.dict(os.environ, {"PYROSCOPE_ENABLED": "true"}, clear=False),
            self.assertLogs("hello", level="WARNING") as logs,
        ):
            pyroscope_setup.configure_pyroscope()

        self.assertTrue(
            any("missing PYROSCOPE_SERVER_ADDRESS" in message for message in logs.output)
        )

    def test_configure_pyroscope_logs_warning_when_import_fails(self) -> None:
        self.reset_pyroscope_for_test()
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
        self.reset_pyroscope_for_test()
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
                "register_span_processor",
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

        with _mock_span_processor_imports(proxy_provider):
            result = pyroscope_setup.register_span_processor()

        self.assertTrue(result)
        real_provider.add_span_processor.assert_called_once_with("proc")

    def test_register_span_processor_falls_back_when_real_adder_is_not_callable(self) -> None:
        for invalid_adder in (None, False, "not callable", object()):
            provider = types.SimpleNamespace(
                _real_provider=types.SimpleNamespace(add_span_processor=invalid_adder),
                add_span_processor=mock.Mock(),
            )
            with (
                TestCase.subTest(self, invalid_adder=invalid_adder),
                _mock_span_processor_imports(provider) as processor_constructor,
            ):
                self.assertTrue(pyroscope_setup.register_span_processor())
            provider.add_span_processor.assert_called_once_with("proc")
            processor_constructor.assert_called_once_with()

    def test_register_span_processor_warns_when_neither_adder_is_callable(self) -> None:
        providers = (
            types.SimpleNamespace(add_span_processor=False),
            types.SimpleNamespace(
                _real_provider=types.SimpleNamespace(add_span_processor="not callable"),
                add_span_processor=False,
            ),
        )
        for provider in providers:
            with (
                TestCase.subTest(self, provider=provider),
                _mock_span_processor_imports(provider) as processor_constructor,
                self.assertLogs("hello", level="WARNING") as logs,
            ):
                self.assertFalse(pyroscope_setup.register_span_processor())
            processor_constructor.assert_not_called()
            self.assertTrue(
                any(
                    "could not register pyroscope span-processor" in message
                    for message in logs.output
                )
            )

    def test_register_span_processor_falls_back_to_proxy_provider_and_warns_without_adder(
        self,
    ) -> None:
        provider = types.SimpleNamespace(
            _real_provider=object(),
            add_span_processor=mock.Mock(),
        )

        with _mock_span_processor_imports(provider):
            result = pyroscope_setup.register_span_processor()

        self.assertTrue(result)
        provider.add_span_processor.assert_called_once_with("proc")

        provider_without_adder = types.SimpleNamespace(_real_provider=object())

        with (
            _mock_span_processor_imports(provider_without_adder),
            self.assertLogs("hello", level="WARNING") as logs,
        ):
            missing_result = pyroscope_setup.register_span_processor()

        self.assertFalse(missing_result)
        self.assertTrue(
            any("could not register pyroscope span-processor" in message for message in logs.output)
        )
