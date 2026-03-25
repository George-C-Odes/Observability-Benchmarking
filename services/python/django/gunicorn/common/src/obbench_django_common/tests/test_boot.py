from __future__ import annotations

from unittest import TestCase, mock

from obbench_django_common.infrastructure import boot


class BootObservabilityTests(TestCase):
    @staticmethod
    def test_instrument_app_delegates_to_otel_setup() -> None:
        with mock.patch(
            "obbench_django_common.infrastructure.otel_setup.instrument_app"
        ) as instrument_app:
            boot._instrument_app()

        instrument_app.assert_called_once_with()

    def test_init_observability_calls_helpers_in_order(self) -> None:
        calls: list[str] = []

        with (
            mock.patch(
                "obbench_django_common.infrastructure.otel_setup.configure_sdk",
                side_effect=lambda: calls.append("configure_sdk"),
            ) as configure_sdk,
            mock.patch(
                "obbench_django_common.infrastructure.otel_metrics.register_metrics",
                side_effect=lambda: calls.append("register_metrics"),
            ) as register_metrics,
            mock.patch(
                "obbench_django_common.infrastructure.pyroscope_setup.configure_pyroscope",
                side_effect=lambda: calls.append("configure_pyroscope"),
            ) as configure_pyroscope,
        ):
            boot._init_observability()

        configure_sdk.assert_called_once_with()
        register_metrics.assert_called_once_with()
        configure_pyroscope.assert_called_once_with()
        self.assertEqual(
            ["configure_sdk", "register_metrics", "configure_pyroscope"],
            calls,
        )

    def test_init_observability_propagates_unexpected_errors(self) -> None:
        with (
            mock.patch(
                "obbench_django_common.infrastructure.otel_setup.configure_sdk",
                side_effect=RuntimeError("boom"),
            ),
            mock.patch(
                "obbench_django_common.infrastructure.otel_metrics.register_metrics"
            ) as register_metrics,
            mock.patch(
                "obbench_django_common.infrastructure.pyroscope_setup.configure_pyroscope"
            ) as configure_pyroscope,
        ):
            with self.assertRaisesRegex(RuntimeError, "boom"):
                boot._init_observability()

        register_metrics.assert_not_called()
        configure_pyroscope.assert_not_called()
