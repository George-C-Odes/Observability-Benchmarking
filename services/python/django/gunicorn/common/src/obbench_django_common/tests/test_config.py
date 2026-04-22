from __future__ import annotations

import os
from unittest import TestCase, mock

from obbench_django_common.infrastructure import config


class AppConfigTests(TestCase):
    def tearDown(self) -> None:
        config.load_config.cache_clear()

    def test_env_int_invalid_falls_back_to_default(self) -> None:
        with mock.patch.dict(os.environ, {"CACHE_SIZE": "not-an-int"}, clear=False):
            self.assertEqual(123, config._env_int("CACHE_SIZE", 123))

    def test_env_bool_handles_truthy_and_fallback_values(self) -> None:
        with mock.patch.dict(os.environ, {"PYROSCOPE_ENABLED": "true"}, clear=False):
            self.assertTrue(config._env_bool("PYROSCOPE_ENABLED", False))

        with mock.patch.dict(os.environ, {"PYROSCOPE_ENABLED": ""}, clear=False):
            self.assertFalse(config._env_bool("PYROSCOPE_ENABLED", False))

        with mock.patch.dict(os.environ, {"PYROSCOPE_ENABLED": "unexpected"}, clear=False):
            self.assertTrue(config._env_bool("PYROSCOPE_ENABLED", True))

    def test_load_config_reads_environment_and_is_cached_until_cleared(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "CACHE_SIZE": "77",
                "CACHE_IMPL": "dict",
                "HOST": "127.0.0.1",
                "PORT": "9090",
                "LOG_LEVEL": "debug",
                "HELLO_VARIANT": "reactive",
                "OTEL_SERVICE_NAME": "django-reactive",
                "PYROSCOPE_ENABLED": "true",
                "PYROSCOPE_SERVER_ADDRESS": "http://pyroscope:4040",
                "PYROSCOPE_APPLICATION_NAME": "agent/django-reactive",
            },
            clear=False,
        ):
            first = config.load_config()
            second = config.load_config()

        self.assertIs(first, second)
        self.assertEqual(77, first.cache_size)
        self.assertEqual("dict", first.cache_impl)
        self.assertEqual("127.0.0.1", first.host)
        self.assertEqual(9090, first.port)
        self.assertEqual("DEBUG", first.log_level)
        self.assertEqual("reactive", first.hello_variant)
        self.assertEqual("/hello/reactive", first.endpoint_path)
        self.assertEqual("Hello from Django reactive REST ", first.greeting_prefix)
        self.assertEqual("django-reactive", first.otel_service_name)
        self.assertTrue(first.pyroscope_enabled)
        self.assertEqual("http://pyroscope:4040", first.pyroscope_server_address)
        self.assertEqual("agent/django-reactive", first.pyroscope_application_name)

        config.load_config.cache_clear()
        with mock.patch.dict(os.environ, {"HELLO_VARIANT": "platform"}, clear=False):
            refreshed = config.load_config()

        self.assertEqual("platform", refreshed.hello_variant)

    def test_load_config_rejects_unsupported_variant(self) -> None:
        with mock.patch.dict(os.environ, {"HELLO_VARIANT": "threads"}, clear=False):
            with self.assertRaisesRegex(ValueError, "Unsupported HELLO_VARIANT"):
                config.load_config()
