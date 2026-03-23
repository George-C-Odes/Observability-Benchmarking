from __future__ import annotations

import os
import sys
from unittest import TestCase, mock

from obbench_django_common.infrastructure import otel_setup
from obbench_django_common.infrastructure.otel_setup import (
    should_suppress_context_detach_errors,
)


class ShouldSuppressContextDetachErrorsTests(TestCase):
    """Unit tests for should_suppress_context_detach_errors().

    Precedence rules under test:
    1. OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS=true/1/yes  → always True
    2. OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS=false/0/no  → always False
    3. Env var absent/empty                             → True iff ASGI + Python ≥ 3.13
    """

    # ------------------------------------------------------------------
    # Precedence 1: explicit true
    # ------------------------------------------------------------------

    def test_explicit_true_enables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "true"},
            clear=False,
        ):
            self.assertTrue(should_suppress_context_detach_errors())

    def test_explicit_1_enables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "1"},
            clear=False,
        ):
            self.assertTrue(should_suppress_context_detach_errors())

    def test_explicit_yes_enables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "yes"},
            clear=False,
        ):
            self.assertTrue(should_suppress_context_detach_errors())

    def test_explicit_true_ignores_variant_and_python_version(self) -> None:
        """OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS=true wins even on WSGI + Python 3.11."""
        with mock.patch.dict(
            os.environ,
            {
                "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "true",
                "HELLO_VARIANT": "platform",
            },
            clear=False,
        ), mock.patch.object(sys, "version_info", (3, 11, 0)):
            self.assertTrue(should_suppress_context_detach_errors())

    # ------------------------------------------------------------------
    # Precedence 2: explicit false (overrides even ASGI + Python 3.13+)
    # ------------------------------------------------------------------

    def test_explicit_false_disables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "false"},
            clear=False,
        ):
            self.assertFalse(should_suppress_context_detach_errors())

    def test_explicit_0_disables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "0"},
            clear=False,
        ):
            self.assertFalse(should_suppress_context_detach_errors())

    def test_explicit_no_disables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "no"},
            clear=False,
        ):
            self.assertFalse(should_suppress_context_detach_errors())

    def test_explicit_false_overrides_asgi_plus_python313(self) -> None:
        """OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS=false wins even on ASGI + Python 3.13."""
        with mock.patch.dict(
            os.environ,
            {
                "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "false",
                "HELLO_VARIANT": "reactive",
            },
            clear=False,
        ), mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertFalse(should_suppress_context_detach_errors())

    # ------------------------------------------------------------------
    # Precedence 3: auto-detect (env var absent or empty)
    # ------------------------------------------------------------------

    def test_auto_detect_asgi_python313_enables_suppression(self) -> None:
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["HELLO_VARIANT"] = "reactive"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertTrue(should_suppress_context_detach_errors())

    def test_auto_detect_asgi_python314_enables_suppression(self) -> None:
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["HELLO_VARIANT"] = "reactive"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 14, 0)):
            self.assertTrue(should_suppress_context_detach_errors())

    def test_auto_detect_asgi_python312_disables_suppression(self) -> None:
        """ASGI but Python < 3.13 should not suppress."""
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["HELLO_VARIANT"] = "reactive"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 12, 0)):
            self.assertFalse(should_suppress_context_detach_errors())

    def test_auto_detect_wsgi_python313_disables_suppression(self) -> None:
        """Python 3.13 but non-ASGI (WSGI) should not suppress."""
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["HELLO_VARIANT"] = "platform"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertFalse(should_suppress_context_detach_errors())

    def test_auto_detect_missing_variant_defaults_to_wsgi(self) -> None:
        """No HELLO_VARIANT should default to platform (WSGI), so no suppression."""
        env = {k: v for k, v in os.environ.items()
               if k not in ("OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS", "HELLO_VARIANT")}
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertFalse(should_suppress_context_detach_errors())

    def test_auto_detect_empty_env_var_treated_as_unset(self) -> None:
        """Empty string for OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS triggers auto-detect."""
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"] = ""
        env["HELLO_VARIANT"] = "reactive"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertTrue(should_suppress_context_detach_errors())

class OTelSetupLifecycleTests(TestCase):
    def setUp(self) -> None:
        otel_setup.reset_otel_setup_state()
        self.addCleanup(otel_setup.reset_otel_setup_state)
        self._otel_sdk_disabled_env = mock.patch.dict(
            os.environ,
            {"OTEL_SDK_DISABLED": "false"},
            clear=False,
        )
        self._otel_sdk_disabled_env.start()
        self.addCleanup(self._otel_sdk_disabled_env.stop)

    @staticmethod
    def test_instrument_app_applies_available_instrumentors() -> None:
        with mock.patch.object(otel_setup, "_apply_django_instrumentor") as django_inst, \
             mock.patch.object(otel_setup, "_apply_logging_instrumentor") as logging_inst:
            otel_setup.instrument_app()

        django_inst.assert_called_once_with()
        logging_inst.assert_called_once_with()

    def test_instrument_app_continues_when_django_instrumentor_fails(self) -> None:
        with mock.patch.object(
            otel_setup,
            "_apply_django_instrumentor",
            side_effect=RuntimeError("boom"),
        ), mock.patch.object(otel_setup, "_apply_logging_instrumentor") as logging_inst, \
             self.assertLogs("hello", level="DEBUG") as logs:
            otel_setup.instrument_app()

        logging_inst.assert_called_once_with()
        self.assertTrue(
            any("DjangoInstrumentor unavailable" in message for message in logs.output)
        )

    def test_configure_sdk_logs_warning_when_sdk_wiring_fails(self) -> None:
        with mock.patch.object(
            otel_setup,
            "should_suppress_context_detach_errors",
            return_value=False,
        ), mock.patch.object(
            otel_setup,
            "_do_configure_sdk",
            side_effect=RuntimeError("boom"),
        ), self.assertLogs("hello", level="WARNING") as logs:
            otel_setup.configure_sdk()

        self.assertTrue(
            any(
                "OTel SDK setup failed — telemetry disabled for this worker" in message
                for message in logs.output
            )
        )

    def test_shutdown_sdk_continues_after_trace_shutdown_failure(self) -> None:
        with mock.patch.object(
            otel_setup,
            "_shutdown_traces_and_metrics",
            side_effect=RuntimeError("boom"),
        ), mock.patch.object(otel_setup, "_shutdown_logs") as shutdown_logs, \
             self.assertLogs("hello", level="DEBUG") as logs:
            otel_setup.shutdown_sdk()

        shutdown_logs.assert_called_once_with()
        self.assertTrue(
            any("OTel SDK shutdown error (traces/metrics)" in message for message in logs.output)
        )

