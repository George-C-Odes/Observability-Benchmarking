from __future__ import annotations

from typing import Any
from unittest import mock

from asgiref.sync import async_to_sync
from django.test import RequestFactory, SimpleTestCase

from obbench_django_common.api import views


class _FakeHelloService:
    def __init__(self, result: str = "Hello from Django platform REST value-1") -> None:
        self._result = result
        self.calls: list[int] = []

    def hello(self, sleep_seconds: int = 0) -> str:
        self.calls.append(sleep_seconds)
        return self._result


# noinspection PyPep8Naming
class PlatformViewTests(SimpleTestCase):
    def test_platform_returns_json_and_caches_service_reference(self) -> None:
        views.reset_cached_hello_service()
        self.addCleanup(views.reset_cached_hello_service)
        factory = RequestFactory()
        service = _FakeHelloService()

        with mock.patch(
            "obbench_django_common.api.views.get_hello_service", return_value=service
        ) as get_service:
            response = views.platform(factory.get("/hello/platform"))
            cached_response = views.platform(factory.get("/hello/platform"))

        self.assertEqual(200, response.status_code)
        self.assertEqual(200, cached_response.status_code)
        self.assertEqual("application/json", response["Content-Type"])
        self.assertEqual(b'"Hello from Django platform REST value-1"', response.content)
        get_service.assert_called_once_with()
        self.assertEqual([0, 0], service.calls)

    def test_platform_forwards_sleep_parameter(self) -> None:
        views.reset_cached_hello_service()
        self.addCleanup(views.reset_cached_hello_service)
        factory = RequestFactory()
        service = _FakeHelloService()

        with mock.patch("obbench_django_common.api.views.get_hello_service", return_value=service):
            response = views.platform(factory.get("/hello/platform", {"sleep": "7"}))

        self.assertEqual(200, response.status_code)
        self.assertEqual([7], service.calls)

    @mock.patch("obbench_django_common.api.views.asyncio.sleep")
    def test_reactive_awaits_sleep_parameter(self, sleep_mock: Any) -> None:
        views.reset_cached_hello_service()
        self.addCleanup(views.reset_cached_hello_service)
        factory = RequestFactory()
        service = _FakeHelloService("Hello from Django reactive REST value-1")

        with mock.patch("obbench_django_common.api.views.get_hello_service", return_value=service):
            response = async_to_sync(views.reactive)(factory.get("/hello/reactive", {"sleep": "5"}))

        self.assertEqual(200, response.status_code)
        self.assertEqual(b'"Hello from Django reactive REST value-1"', response.content)
        self.assertEqual([0], service.calls)
        sleep_mock.assert_called_once_with(5)


# noinspection PyPep8Naming
class HealthViewTests(SimpleTestCase):
    def test_healthz_returns_200(self) -> None:
        response = views.healthz(RequestFactory().get("/healthz"))
        self.assertEqual(200, response.status_code)

    def test_readyz_returns_200(self) -> None:
        response = views.readyz(RequestFactory().get("/readyz"))
        self.assertEqual(200, response.status_code)

    def test_livez_returns_200(self) -> None:
        response = views.livez(RequestFactory().get("/livez"))
        self.assertEqual(200, response.status_code)
