from __future__ import annotations

from typing import Any
from unittest import TestCase, mock

from obbench_django_common.application import hello_service
from obbench_django_common.application.hello_service import HelloService
from obbench_django_common.application.port.cache_port import CachePort


class _FakeCache(CachePort):
    def __init__(self, value: str = "value-1") -> None:
        self._value = value
        self.last_key: str | None = None

    def get(self, key: str) -> str:
        self.last_key = key
        return self._value

    def size(self) -> int:
        return 1

    def close(self) -> None:
        return None


# noinspection PyProtectedMember
# noinspection PyPep8Naming
class HelloServiceTests(TestCase):
    def setUp(self) -> None:
        hello_service._reset_counter()

    def test_platform_hello_returns_cached_greeting(self) -> None:
        cache = _FakeCache()
        service = HelloService(cache, greeting_prefix="Hello from Django platform REST ")

        result = service.hello()

        self.assertEqual("Hello from Django platform REST value-1", result)
        self.assertEqual("1", cache.last_key)
        self.assertEqual(1, hello_service.get_request_count())

    @mock.patch("obbench_django_common.application.hello_service.time.sleep")
    def test_platform_hello_sleeps_only_when_requested(self, sleep_mock: Any) -> None:
        service = HelloService(_FakeCache(), greeting_prefix="Hello from Django platform REST ")

        result = service.hello(3)

        self.assertEqual("Hello from Django platform REST value-1", result)
        sleep_mock.assert_called_once_with(3)
        self.assertEqual(1, hello_service.get_request_count())
