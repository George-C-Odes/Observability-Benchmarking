"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache

_SUPPORTED_VARIANTS = frozenset({"platform", "reactive"})


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "")
    if raw.strip():
        try:
            return int(raw)
        except ValueError:
            pass
    return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if raw in ("true", "1", "yes"):
        return True
    if raw in ("false", "0", "no", ""):
        return default
    return default


def env_int(name: str, default: int) -> int:
    """Public wrapper for integer environment parsing."""
    return _env_int(name, default)


def env_bool(name: str, default: bool) -> bool:
    """Public wrapper for boolean environment parsing."""
    return _env_bool(name, default)


class AppConfig:
    """Immutable application configuration."""

    __slots__ = (
        "cache_size",
        "cache_impl",
        "host",
        "port",
        "log_level",
        "hello_variant",
        "otel_service_name",
        "pyroscope_enabled",
        "pyroscope_server_address",
        "pyroscope_application_name",
    )

    cache_size: int
    cache_impl: str
    host: str
    port: int
    log_level: str
    hello_variant: str
    otel_service_name: str
    pyroscope_enabled: bool
    pyroscope_server_address: str
    pyroscope_application_name: str

    def __init__(self) -> None:
        self.cache_size = _env_int("CACHE_SIZE", 50_000)
        self.cache_impl = os.environ.get("CACHE_IMPL", "cachetools").strip().lower()
        self.host = os.environ.get("HOST", "0.0.0.0")
        self.port = _env_int("PORT", 8080)
        self.log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
        self.hello_variant = (
            os.environ.get("HELLO_VARIANT", "platform").strip().lower() or "platform"
        )
        self.otel_service_name = os.environ.get("OTEL_SERVICE_NAME", "django")
        self.pyroscope_enabled = _env_bool("PYROSCOPE_ENABLED", False)
        self.pyroscope_server_address = os.environ.get("PYROSCOPE_SERVER_ADDRESS", "")
        self.pyroscope_application_name = os.environ.get("PYROSCOPE_APPLICATION_NAME", "")

        if self.hello_variant not in _SUPPORTED_VARIANTS:
            raise ValueError(
                f"Unsupported HELLO_VARIANT {self.hello_variant!r} "
                f"(expected one of {sorted(_SUPPORTED_VARIANTS)!r})"
            )

    @property
    def endpoint_path(self) -> str:
        return f"/hello/{self.hello_variant}"

    @property
    def greeting_prefix(self) -> str:
        return f"Hello from Django {self.hello_variant} REST "


@lru_cache(maxsize=1)
def load_config() -> AppConfig:
    """Create an ``AppConfig`` from the current process environment."""
    return AppConfig()
