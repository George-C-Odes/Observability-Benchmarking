from __future__ import annotations

import os
import sys
from unittest import TestCase, mock

from obbench_django_common.infrastructure.otel_setup import (
    _should_suppress_context_detach_errors,
)


# noinspection PyProtectedMember
class ShouldSuppressContextDetachErrorsTests(TestCase):
    """Unit tests for _should_suppress_context_detach_errors().

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
            self.assertTrue(_should_suppress_context_detach_errors())

    def test_explicit_1_enables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "1"},
            clear=False,
        ):
            self.assertTrue(_should_suppress_context_detach_errors())

    def test_explicit_yes_enables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "yes"},
            clear=False,
        ):
            self.assertTrue(_should_suppress_context_detach_errors())

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
            self.assertTrue(_should_suppress_context_detach_errors())

    # ------------------------------------------------------------------
    # Precedence 2: explicit false (overrides even ASGI + Python 3.13+)
    # ------------------------------------------------------------------

    def test_explicit_false_disables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "false"},
            clear=False,
        ):
            self.assertFalse(_should_suppress_context_detach_errors())

    def test_explicit_0_disables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "0"},
            clear=False,
        ):
            self.assertFalse(_should_suppress_context_detach_errors())

    def test_explicit_no_disables_suppression(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS": "no"},
            clear=False,
        ):
            self.assertFalse(_should_suppress_context_detach_errors())

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
            self.assertFalse(_should_suppress_context_detach_errors())

    # ------------------------------------------------------------------
    # Precedence 3: auto-detect (env var absent or empty)
    # ------------------------------------------------------------------

    def test_auto_detect_asgi_python313_enables_suppression(self) -> None:
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["HELLO_VARIANT"] = "reactive"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertTrue(_should_suppress_context_detach_errors())

    def test_auto_detect_asgi_python314_enables_suppression(self) -> None:
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["HELLO_VARIANT"] = "reactive"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 14, 0)):
            self.assertTrue(_should_suppress_context_detach_errors())

    def test_auto_detect_asgi_python312_disables_suppression(self) -> None:
        """ASGI but Python < 3.13 should not suppress."""
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["HELLO_VARIANT"] = "reactive"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 12, 0)):
            self.assertFalse(_should_suppress_context_detach_errors())

    def test_auto_detect_wsgi_python313_disables_suppression(self) -> None:
        """Python 3.13 but non-ASGI (WSGI) should not suppress."""
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["HELLO_VARIANT"] = "platform"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertFalse(_should_suppress_context_detach_errors())

    def test_auto_detect_missing_variant_defaults_to_wsgi(self) -> None:
        """No HELLO_VARIANT should default to platform (WSGI), so no suppression."""
        env = {k: v for k, v in os.environ.items()
               if k not in ("OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS", "HELLO_VARIANT")}
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertFalse(_should_suppress_context_detach_errors())

    def test_auto_detect_empty_env_var_treated_as_unset(self) -> None:
        """Empty string for OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS triggers auto-detect."""
        env = {k: v for k, v in os.environ.items() if k != "OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"}
        env["OTEL_SUPPRESS_CONTEXT_DETACH_ERRORS"] = ""
        env["HELLO_VARIANT"] = "reactive"
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(sys, "version_info", (3, 13, 0)):
            self.assertTrue(_should_suppress_context_detach_errors())
