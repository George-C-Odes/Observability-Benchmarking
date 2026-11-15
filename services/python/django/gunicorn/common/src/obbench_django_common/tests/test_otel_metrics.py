from __future__ import annotations

from types import SimpleNamespace
from unittest import TestCase, mock

from obbench_django_common.infrastructure import otel_metrics


class OTelMetricsTests(TestCase):
    def reset_metrics_for_test(self) -> None:
        otel_metrics.reset_otel_metrics_state()
        self.addCleanup(otel_metrics.reset_otel_metrics_state)

    def test_register_metrics_only_registers_once_after_success(self) -> None:
        self.reset_metrics_for_test()
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

    def test_counter_callback_observes_current_count_with_runtime_endpoint(self) -> None:
        self.reset_metrics_for_test()
        for endpoint in ("/hello/platform", "/hello/reactive"):
            with TestCase.subTest(self, endpoint=endpoint):
                otel_metrics.reset_otel_metrics_state()
                meter = mock.Mock()
                with (
                    mock.patch("opentelemetry.metrics.get_meter", return_value=meter),
                    mock.patch(
                        "obbench_django_common.infrastructure.boot.get_app_config",
                        return_value=SimpleNamespace(endpoint_path=endpoint),
                    ),
                    mock.patch(
                        "obbench_django_common.application.hello_service.get_request_count",
                        side_effect=[0, 7],
                    ),
                ):
                    otel_metrics.register_metrics()
                    kwargs = meter.create_observable_counter.call_args.kwargs
                    self.assertEqual("hello.request.count", kwargs["name"])
                    (callback,) = kwargs["callbacks"]
                    for expected in (0, 7):
                        (observation,) = callback(None)
                        self.assertEqual(expected, observation.value)
                        self.assertEqual({"endpoint": endpoint}, observation.attributes)

    def test_register_metrics_retries_after_handled_failure(self) -> None:
        self.reset_metrics_for_test()
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
