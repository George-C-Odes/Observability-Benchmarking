"""Django app configuration for the shared benchmarking package."""

from django.apps import AppConfig


class BenchmarkHelloConfig(AppConfig):
    """Shared app config used by the platform and reactive Django modules."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "obbench_django_common"
    verbose_name = "Observability Benchmark Hello"

    def ready(self) -> None:
        """Eager-load the cache and shared runtime wiring on startup."""
        from obbench_django_common.infrastructure.boot import on_startup

        on_startup()