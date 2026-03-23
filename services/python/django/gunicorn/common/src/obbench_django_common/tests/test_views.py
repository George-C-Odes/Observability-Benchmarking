from __future__ import annotations

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


# noinspection PyProtectedMember
class PlatformViewTests(SimpleTestCase):
    def setUp(self) -> None:
        self.factory = RequestFactory()
        views._State.svc = None
        self.addCleanup(setattr, views._State, "svc", None)

    def test_platform_returns_json_and_caches_service_reference(self) -> None:
        service = _FakeHelloService()

        with mock.patch(
            "obbench_django_common.api.views.get_hello_service", return_value=service
        ) as get_service:
            response = views.platform(self.factory.get("/hello/platform"))

        self.assertEqual(200, response.status_code)
        self.assertEqual("application/json", response["Content-Type"])
        self.assertEqual(b'"Hello from Django platform REST value-1"', response.content)
        get_service.assert_called_once_with()
        self.assertIs(views._State.svc, service)

    def test_platform_forwards_sleep_parameter(self) -> None:
        service = _FakeHelloService()
        views._State.svc = service

        response = views.platform(self.factory.get("/hello/platform", {"sleep": "7"}))

        self.assertEqual(200, response.status_code)
        self.assertEqual([7], service.calls)

    @mock.patch("obbench_django_common.api.views.asyncio.sleep")
    def test_reactive_awaits_sleep_parameter(self, sleep_mock: mock.Mock) -> None:
        service = _FakeHelloService("Hello from Django reactive REST value-1")
        views._State.svc = service

        response = async_to_sync(views.reactive)(
            self.factory.get("/hello/reactive", {"sleep": "5"})
        )

        self.assertEqual(200, response.status_code)
        self.assertEqual(b'"Hello from Django reactive REST value-1"', response.content)
        self.assertEqual([0], service.calls)
        sleep_mock.assert_called_once_with(5)


class HealthViewTests(SimpleTestCase):
    def setUp(self) -> None:
        self.factory = RequestFactory()

    def test_healthz_returns_200(self) -> None:
        response = views.healthz(self.factory.get("/healthz"))
        self.assertEqual(200, response.status_code)

    def test_readyz_returns_200(self) -> None:
        response = views.readyz(self.factory.get("/readyz"))
        self.assertEqual(200, response.status_code)

    def test_livez_returns_200(self) -> None:
        response = views.livez(self.factory.get("/livez"))
        self.assertEqual(200, response.status_code)