"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
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


@dataclass(frozen=True, slots=True)
class AppConfig:
    """Immutable application configuration."""

    # Cache
    cache_size: int = field(default_factory=lambda: _env_int("CACHE_SIZE", 50_000))
    cache_impl: str = field(
        default_factory=lambda: os.environ.get("CACHE_IMPL", "cachetools").strip().lower()
    )

    # Server
    host: str = field(default_factory=lambda: os.environ.get("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: _env_int("PORT", 8080))

    # Logging
    log_level: str = field(default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO").upper())

    # Service mode
    hello_variant: str = field(
        default_factory=lambda: os.environ.get("HELLO_VARIANT", "platform").strip().lower()
        or "platform"
    )

    # OTel
    otel_service_name: str = field(
        default_factory=lambda: os.environ.get("OTEL_SERVICE_NAME", "django")
    )

    # Pyroscope
    pyroscope_enabled: bool = field(default_factory=lambda: _env_bool("PYROSCOPE_ENABLED", False))
    pyroscope_server_address: str = field(
        default_factory=lambda: os.environ.get("PYROSCOPE_SERVER_ADDRESS", "")
    )
    pyroscope_application_name: str = field(
        default_factory=lambda: os.environ.get("PYROSCOPE_APPLICATION_NAME", "")
    )

    def __post_init__(self) -> None:
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