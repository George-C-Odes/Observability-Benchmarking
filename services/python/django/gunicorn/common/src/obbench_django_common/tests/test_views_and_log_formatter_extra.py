from __future__ import annotations

import json
import logging
from typing import Any
from unittest import TestCase, mock

from asgiref.sync import async_to_sync
from django.test import RequestFactory, SimpleTestCase

from obbench_django_common.api import views
from obbench_django_common.infrastructure import log_formatter
from obbench_django_common.infrastructure.log_formatter import JsonFormatter


class _FakeHelloService:
    def __init__(self, result: str = "Hello from Django platform REST value-1") -> None:
        self._result = result
        self.calls: list[int] = []

    def hello(self, sleep_seconds: int = 0) -> str:
        self.calls.append(sleep_seconds)
        return self._result


# noinspection PyProtectedMember
class ViewHelperTests(SimpleTestCase):
    def test_platform_logs_thread_when_requested(self) -> None:
        views.reset_cached_hello_service()
        self.addCleanup(views.reset_cached_hello_service)
        factory = RequestFactory()
        service = _FakeHelloService()

        with (
            mock.patch("obbench_django_common.api.views.get_hello_service", return_value=service),
            mock.patch("obbench_django_common.api.views._log_thread") as log_thread,
        ):
            response = views.platform(factory.get("/hello/platform", {"log": "yes"}))

        self.assertEqual(200, response.status_code)
        self.assertEqual([0], service.calls)
        log_thread.assert_called_once_with("platform")

    @mock.patch("obbench_django_common.api.views.asyncio.sleep")
    def test_reactive_ignores_invalid_sleep_and_false_log_values(
        self,
        sleep_mock: Any,
    ) -> None:
        views.reset_cached_hello_service()
        self.addCleanup(views.reset_cached_hello_service)
        factory = RequestFactory()
        service = _FakeHelloService("Hello from Django reactive REST value-1")

        with (
            mock.patch("obbench_django_common.api.views.get_hello_service", return_value=service),
            mock.patch("obbench_django_common.api.views._log_thread") as log_thread,
        ):
            response = async_to_sync(views.reactive)(
                factory.get("/hello/reactive", {"sleep": "oops", "log": "no"})
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(b'"Hello from Django reactive REST value-1"', response.content)
        self.assertEqual([0], service.calls)
        sleep_mock.assert_not_called()
        log_thread.assert_not_called()

    def test_parse_helpers_and_json_response_cover_fallback_paths(self) -> None:
        self.assertEqual(9, views._parse_int("oops", 9))
        self.assertEqual(8, views._parse_int(None, 8))
        self.assertTrue(views._parse_bool("TRUE"))
        self.assertFalse(views._parse_bool("off"))

        response = views._json_string_response("Hello")

        self.assertEqual("application/json", response["Content-Type"])
        self.assertEqual(b'"Hello"', response.content)


class JsonFormatterExtraTests(TestCase):
    def test_format_without_trace_context_and_with_exception(self) -> None:
        formatter = JsonFormatter()

        try:
            raise RuntimeError("boom")
        except RuntimeError:
            exc_info = __import__("sys").exc_info()

        record = logging.LogRecord(
            name="hello",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="failure",
            args=(),
            exc_info=exc_info,
        )

        with mock.patch.object(log_formatter, "_OTEL_AVAILABLE", False):
            payload = json.loads(formatter.format(record))

        self.assertEqual("ERROR", payload["level"])
        self.assertEqual("failure", payload["message"])
        self.assertIn("RuntimeError: boom", payload["exception"])
        self.assertNotIn("traceId", payload)

    def test_format_time_honors_explicit_date_format(self) -> None:
        formatter = JsonFormatter(datefmt="%Y")
        record = logging.LogRecord(
            name="hello",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello",
            args=(),
            exc_info=None,
        )
        record.created = 0
        record.msecs = 0

        self.assertEqual("1970", formatter.formatTime(record, formatter.datefmt))
