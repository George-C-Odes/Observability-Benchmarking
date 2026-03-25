from __future__ import annotations

from types import SimpleNamespace
from unittest import TestCase, mock

from obbench_django_common.infrastructure import otel_metrics


class OTelMetricsTests(TestCase):
    def setUp(self) -> None:
        otel_metrics.reset_otel_metrics_state()
        self.addCleanup(otel_metrics.reset_otel_metrics_state)

    @staticmethod
    def test_register_metrics_only_registers_once_after_success() -> None:
        meter = mock.Mock()
        cfg = SimpleNamespace(endpoint_path="/hello/platform")

        with (
            mock.patch(
                "opentelemetry.metrics.get_meter",
                return_value=meter,
            ) as get_meter,
            mock.patch(
                "obbench_django_common.infrastructure.boot.get_app_config",
                return_value=cfg,
            ),
        ):
            otel_metrics.register_metrics()
            otel_metrics.register_metrics()

        get_meter.assert_called_once_with("hello")
        meter.create_observable_counter.assert_called_once()

    def test_register_metrics_retries_after_handled_failure(self) -> None:
        meter = mock.Mock()
        meter.create_observable_counter.side_effect = [RuntimeError("boom"), None]
        cfg = SimpleNamespace(endpoint_path="/hello/platform")

        with (
            mock.patch(
                "opentelemetry.metrics.get_meter",
                return_value=meter,
            ),
            mock.patch(
                "obbench_django_common.infrastructure.boot.get_app_config",
                return_value=cfg,
            ),
            self.assertLogs("hello", level="DEBUG") as logs,
        ):
            otel_metrics.register_metrics()
            otel_metrics.register_metrics()

        self.assertEqual(2, meter.create_observable_counter.call_count)
        self.assertTrue(
            any(
                "failed to register hello.request.count (OTel SDK may not be active)" in message
                for message in logs.output
            )
        )
