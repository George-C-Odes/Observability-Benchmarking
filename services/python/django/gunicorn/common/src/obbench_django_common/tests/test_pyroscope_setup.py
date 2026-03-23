from __future__ import annotations

import logging
import os
import sys
import types
from unittest import TestCase, mock

from obbench_django_common.infrastructure import pyroscope_setup


class PyroscopeSetupTests(TestCase):
    def setUp(self) -> None:
        pyroscope_setup.reset_pyroscope_state()
        self.addCleanup(pyroscope_setup.reset_pyroscope_state)

    def test_resolve_pyroscope_logging_maps_supported_levels(self) -> None:
        cases = {
            None: (True, logging.WARNING),
            "debug": (True, logging.DEBUG),
            "INFO": (True, logging.INFO),
            "warn": (True, logging.WARNING),
            "warning": (True, logging.WARNING),
            "error": (True, logging.ERROR),
            "fatal": (True, logging.CRITICAL),
            "off": (False, logging.WARNING),
        }

        for raw_level, expected in cases.items():
            self.assertEqual(
                expected,
                pyroscope_setup.resolve_pyroscope_logging(raw_level),
                msg=f"unexpected mapping for raw_level={raw_level!r}",
            )

    @staticmethod
    def test_configure_pyroscope_honors_warn_level() -> None:
        pyroscope_module = types.ModuleType("pyroscope")
        pyroscope_module.LOGGER = mock.Mock()
        pyroscope_module.configure = mock.Mock()

        with mock.patch.dict(
            os.environ,
            {
                "PYROSCOPE_ENABLED": "true",
                "PYROSCOPE_SERVER_ADDRESS": "http://pyroscope:4040",
                "PYROSCOPE_APPLICATION_NAME": "agent/django-platform",
                "PYROSCOPE_LOG_LEVEL": "warn",
                "OTEL_SERVICE_NAME": "django-platform",
            },
            clear=False,
        ), mock.patch.dict(sys.modules, {"pyroscope": pyroscope_module}, clear=False):
            pyroscope_setup.configure_pyroscope()

        pyroscope_module.LOGGER.setLevel.assert_called_once_with(logging.WARNING)
        pyroscope_module.configure.assert_called_once_with(
            application_name="agent/django-platform",
            server_address="http://pyroscope:4040",
            enable_logging=True,
            tags={"service": "django-platform", "env": "dev"},
        )

    def test_configure_pyroscope_disables_native_logging_when_level_is_off(self) -> None:
        pyroscope_module = types.ModuleType("pyroscope")
        pyroscope_module.LOGGER = mock.Mock()
        pyroscope_module.configure = mock.Mock()

        with mock.patch.dict(
            os.environ,
            {
                "PYROSCOPE_ENABLED": "true",
                "PYROSCOPE_SERVER_ADDRESS": "http://pyroscope:4040",
                "PYROSCOPE_APPLICATION_NAME": "agent/django-reactive",
                "PYROSCOPE_LOG_LEVEL": "off",
                "OTEL_SERVICE_NAME": "django-reactive",
            },
            clear=False,
        ), mock.patch.dict(sys.modules, {"pyroscope": pyroscope_module}, clear=False):
            pyroscope_setup.configure_pyroscope()

        pyroscope_module.LOGGER.setLevel.assert_called_once_with(logging.WARNING)
        self.assertFalse(pyroscope_module.configure.call_args.kwargs["enable_logging"])