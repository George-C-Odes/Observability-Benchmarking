from __future__ import annotations

import builtins
import os
import runpy
import sys
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest import SkipTest, TestCase, mock

from obbench_django_common.application.hello_service import HelloService
from obbench_django_common.infrastructure import boot


@lru_cache(maxsize=1)
def _resolve_gunicorn_dir() -> Path:
    def is_gunicorn_dir(path: Path) -> bool:
        return all((path / runtime / "manage.py").is_file() for runtime in ("WSGI", "ASGI"))

    def candidate_paths(root: Path) -> tuple[Path, Path]:
        return root, root / "services" / "python" / "django" / "gunicorn"

    bases: list[Path] = []
    workspace = os.environ.get("GITHUB_WORKSPACE")
    if workspace:
        bases.append(Path(workspace))

    cwd = Path.cwd().resolve()
    bases.extend((cwd, *cwd.parents))
    bases.extend(Path(__file__).resolve().parents)

    seen: set[Path] = set()
    for base in bases:
        for candidate in candidate_paths(base.resolve()):
            if candidate in seen:
                continue
            seen.add(candidate)
            if is_gunicorn_dir(candidate):
                return candidate

    raise FileNotFoundError(
        "Could not locate services/python/django/gunicorn from the current working directory, "
        "GitHub workspace, or installed test package location."
    )


class _FakeCache:
    def __init__(self, size: int = 3) -> None:
        self._size = size

    @staticmethod
    def get(key: str) -> str:
        return f"value-{key}"

    def size(self) -> int:
        return self._size

    @staticmethod
    def close() -> None:
        return None


# noinspection PyProtectedMember
# noinspection PyPep8Naming
class BootTests(TestCase):
    def setUp(self) -> None:
        boot._State.cache = None
        boot._State.config = None
        boot._State.hello_service = None
        boot._State.booted = False

    def tearDown(self) -> None:
        boot._State.cache = None
        boot._State.config = None
        boot._State.hello_service = None
        boot._State.booted = False

    @staticmethod
    def test_on_startup_returns_immediately_when_already_booted() -> None:
        boot._State.booted = True

        with (
            mock.patch.object(boot, "load_config") as load_config,
            mock.patch.object(boot, "create_cache") as create_cache,
            mock.patch.object(boot, "_instrument_app") as instrument_app,
            mock.patch.object(boot, "_init_observability") as init_observability,
        ):
            boot.on_startup()

        load_config.assert_not_called()
        create_cache.assert_not_called()
        instrument_app.assert_not_called()
        init_observability.assert_not_called()

    def test_on_startup_initializes_state_and_standalone_observability(self) -> None:
        cfg = SimpleNamespace(
            hello_variant="platform",
            endpoint_path="/hello/platform",
            cache_size=5,
            cache_impl="dict",
            greeting_prefix="Hello from Django platform REST ",
        )
        cache = _FakeCache(size=5)

        with (
            mock.patch.object(boot, "load_config", return_value=cfg),
            mock.patch.object(boot, "create_cache", return_value=cache),
            mock.patch.object(boot, "_instrument_app") as instrument_app,
            mock.patch.object(boot, "_init_observability") as init_observability,
            mock.patch.object(boot.platform, "python_version", return_value="3.13.0"),
            mock.patch.object(boot.platform, "platform", return_value="test-platform"),
            mock.patch.object(boot.os, "getpid", return_value=1234),
            mock.patch.object(
                boot.sys,
                "modules",
                {key: value for key, value in sys.modules.items() if key != "gunicorn"},
            ),
        ):
            boot.on_startup()

        self.assertTrue(boot._State.booted)
        self.assertIs(cfg, boot._State.config)
        self.assertIs(cache, boot._State.cache)
        self.assertIsInstance(boot._State.hello_service, HelloService)
        instrument_app.assert_called_once_with()
        init_observability.assert_called_once_with()

    def test_post_fork_init_resets_counter_initializes_observability_and_logs_ready(self) -> None:
        with (
            mock.patch(
                "obbench_django_common.application.hello_service.reset_request_count"
            ) as reset_request_count,
            mock.patch.object(boot, "_init_observability") as init_observability,
            mock.patch.object(boot.os, "getpid", return_value=4321),
            self.assertLogs("hello", level="INFO") as logs,
        ):
            boot.post_fork_init()

        reset_request_count.assert_called_once_with()
        init_observability.assert_called_once_with()
        self.assertTrue(any("worker ready: pid=4321" in message for message in logs.output))

    def test_getters_trigger_lazy_startup(self) -> None:
        cfg = SimpleNamespace(endpoint_path="/hello/platform")
        service = object()

        def fake_startup() -> None:
            boot._State.config = cast(Any, cfg)
            boot._State.hello_service = cast(Any, service)

        with mock.patch.object(boot, "on_startup", side_effect=fake_startup) as on_startup:
            self.assertIs(service, boot.get_hello_service())
            self.assertIs(cfg, boot.get_app_config())

        on_startup.assert_called_once_with()


class RuntimeEntrypointTests(TestCase):
    @staticmethod
    def _runtime_dir(runtime: str) -> Path:
        try:
            return _resolve_gunicorn_dir() / runtime
        except FileNotFoundError as exc:
            raise SkipTest(str(exc)) from exc

    @staticmethod
    def _run_path(
        path: Path,
        *,
        env: dict[str, str] | None = None,
        run_name: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, str]]:
        with mock.patch.dict(os.environ, env or {}, clear=True):
            namespace = runpy.run_path(str(path), run_name=run_name)
            return namespace, dict(os.environ)

    def test_manage_py_sets_settings_module_and_executes_cli_for_both_runtimes(self) -> None:
        for runtime in ("WSGI", "ASGI"):
            module_dir = self._runtime_dir(runtime)
            with self.subTest(module_dir=module_dir.name):
                with (
                    mock.patch(
                        "django.core.management.execute_from_command_line"
                    ) as execute_from_command_line,
                    mock.patch.object(sys, "argv", ["manage.py", "check"]),
                ):
                    _, env_after = self._run_path(module_dir / "manage.py", run_name="__main__")

                self.assertEqual("hello_project.settings", env_after["DJANGO_SETTINGS_MODULE"])
                execute_from_command_line.assert_called_once_with(["manage.py", "check"])

    def test_manage_py_raises_helpful_import_error_when_django_is_unavailable(self) -> None:
        real_import = builtins.__import__

        def fake_import(name: str, *args: object, **kwargs: object) -> object:
            if name == "django.core.management":
                raise ImportError("boom")
            return real_import(name, *args, **kwargs)

        with mock.patch("builtins.__import__", side_effect=fake_import):
            with self.assertRaisesRegex(ImportError, "Couldn't import Django"):
                self._run_path(self._runtime_dir("WSGI") / "manage.py", run_name="__main__")

    def test_wsgi_entrypoint_sets_defaults_and_exports_application(self) -> None:
        sentinel = object()

        with mock.patch("django.core.wsgi.get_wsgi_application", return_value=sentinel):
            namespace, env_after = self._run_path(
                self._runtime_dir("WSGI") / "hello_project" / "wsgi.py"
            )

        self.assertIs(sentinel, namespace["application"])
        self.assertEqual("platform", env_after["HELLO_VARIANT"])
        self.assertEqual("hello_project.settings", env_after["DJANGO_SETTINGS_MODULE"])

    def test_asgi_entrypoint_wraps_application_and_sets_reactive_variant(self) -> None:
        asgi_app = object()
        wrapped_app = object()

        with (
            mock.patch("django.core.asgi.get_asgi_application", return_value=asgi_app),
            mock.patch(
                "obbench_django_common.infrastructure.otel_setup.wrap_asgi_application",
                return_value=wrapped_app,
            ) as wrap_asgi_application,
        ):
            namespace, env_after = self._run_path(
                self._runtime_dir("ASGI") / "hello_project" / "asgi.py"
            )

        self.assertIs(wrapped_app, namespace["application"])
        wrap_asgi_application.assert_called_once_with(asgi_app)
        self.assertEqual("reactive", env_after["HELLO_VARIANT"])
        self.assertEqual("hello_project.settings", env_after["DJANGO_SETTINGS_MODULE"])

    def test_asgi_wsgi_entrypoint_sets_settings_module_and_exports_wsgi_application(self) -> None:
        sentinel = object()

        with mock.patch("django.core.wsgi.get_wsgi_application", return_value=sentinel):
            namespace, env_after = self._run_path(
                self._runtime_dir("ASGI") / "hello_project" / "wsgi.py"
            )

        self.assertIs(sentinel, namespace["application"])
        self.assertEqual("hello_project.settings", env_after["DJANGO_SETTINGS_MODULE"])

    def test_wsgi_gunicorn_config_reads_env_and_invokes_hooks(self) -> None:
        namespace, _ = self._run_path(
            self._runtime_dir("WSGI") / "gunicorn.conf.py",
            env={
                "PORT": "9090",
                "DJANGO_PLATFORM_WORKERS": "bad",
                "DJANGO_PLATFORM_THREADS": "7",
                "DJANGO_PLATFORM_BACKLOG": "oops",
                "DJANGO_PLATFORM_REUSE_PORT": "no",
                "LOG_LEVEL": "DEBUG",
            },
        )

        self.assertEqual("0.0.0.0:9090", namespace["bind"])
        self.assertEqual(3, namespace["workers"])
        self.assertEqual(7, namespace["threads"])
        self.assertEqual(8192, namespace["backlog"])
        self.assertFalse(namespace["reuse_port"])
        self.assertEqual("debug", namespace["loglevel"])

        with (
            mock.patch(
                "obbench_django_common.infrastructure.boot.post_fork_init"
            ) as post_fork_init,
            mock.patch(
                "obbench_django_common.infrastructure.otel_setup.shutdown_sdk"
            ) as shutdown_sdk,
        ):
            namespace["post_fork"](None, None)
            namespace["worker_exit"](None, None)

        post_fork_init.assert_called_once_with()
        shutdown_sdk.assert_called_once_with()

    def test_asgi_gunicorn_config_reads_env_and_invokes_hooks(self) -> None:
        namespace, _ = self._run_path(
            self._runtime_dir("ASGI") / "gunicorn.conf.py",
            env={
                "PORT": "9191",
                "DJANGO_REACTIVE_WORKERS": "5",
                "DJANGO_REACTIVE_BACKLOG": "not-a-number",
                "DJANGO_REACTIVE_REUSE_PORT": "0",
                "LOG_LEVEL": "WARNING",
            },
        )

        self.assertEqual("0.0.0.0:9191", namespace["bind"])
        self.assertEqual(5, namespace["workers"])
        self.assertEqual(8192, namespace["backlog"])
        self.assertFalse(namespace["reuse_port"])
        self.assertEqual("warning", namespace["loglevel"])
        self.assertEqual("uvicorn.workers.UvicornWorker", namespace["worker_class"])

        with (
            mock.patch(
                "obbench_django_common.infrastructure.boot.post_fork_init"
            ) as post_fork_init,
            mock.patch(
                "obbench_django_common.infrastructure.otel_setup.shutdown_sdk"
            ) as shutdown_sdk,
        ):
            namespace["post_fork"](None, None)
            namespace["worker_exit"](None, None)

        post_fork_init.assert_called_once_with()
        shutdown_sdk.assert_called_once_with()
