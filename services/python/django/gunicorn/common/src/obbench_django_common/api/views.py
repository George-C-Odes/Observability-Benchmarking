"""HTTP views for the shared Django benchmark endpoints."""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from typing import TYPE_CHECKING

from django.http import HttpRequest, HttpResponse

from obbench_django_common.infrastructure.boot import get_hello_service

if TYPE_CHECKING:
    from obbench_django_common.application.hello_service import HelloService

logger = logging.getLogger("hello")


# noinspection PyMissingConstructor
class _State:
    """Module-level cached reference — avoids ``global`` statement.

    Set on first request; safe under the GIL.
    """

    svc: HelloService | None = None


# Pre-allocated content-type string (interned constant).
_JSON_CT = "application/json"


def platform(request: HttpRequest) -> HttpResponse:
    """Synchronous WSGI endpoint used by ``django-platform``."""
    if _State.svc is None:
        _State.svc = get_hello_service()
    service = _State.svc
    assert service is not None  # noqa: S101

    params = request.GET

    # Fast path: only parse optional params when actually supplied.
    sleep_seconds = _parse_int(params["sleep"], 0) if "sleep" in params else 0

    if "log" in params and _parse_bool(params["log"]):
        _log_thread("platform")

    result = service.hello(sleep_seconds)

    return _json_string_response(result)


async def reactive(request: HttpRequest) -> HttpResponse:
    """Async ASGI endpoint used by ``django-reactive``."""
    if _State.svc is None:
        _State.svc = get_hello_service()
    service = _State.svc
    assert service is not None  # noqa: S101

    params = request.GET
    sleep_seconds = _parse_int(params["sleep"], 0) if "sleep" in params else 0

    if "log" in params and _parse_bool(params["log"]):
        _log_thread("reactive")

    if sleep_seconds > 0:
        await asyncio.sleep(sleep_seconds)

    result = service.hello()

    return _json_string_response(result)


def reset_cached_hello_service() -> None:
    """Clear the cached service reference for isolated tests and reload scenarios."""
    _State.svc = None


def _json_string_response(result: str) -> HttpResponse:
    """Return a JSON string response with minimal serialization overhead."""
    # The result is always a plain-ASCII string (e.g. "Hello from Django
    # platform REST value-1") with no characters that need JSON escaping.
    # Wrapping in double quotes is equivalent to json.dumps(result) but
    # avoids the function-call + escape-scanning overhead of the json module.
    body = '"' + result + '"'
    return HttpResponse(body, content_type=_JSON_CT)


def _log_thread(mode: str) -> None:
    logger.info(
        "%s thread: name=%s, pid=%d, ident=%s",
        mode,
        threading.current_thread().name,
        os.getpid(),
        threading.current_thread().ident,
    )


# ---------------------------------------------------------------------------
# Health probes
# ---------------------------------------------------------------------------


def healthz(_request: HttpRequest) -> HttpResponse:
    """Liveness probe."""
    return HttpResponse(status=200)


def readyz(_request: HttpRequest) -> HttpResponse:
    """Readiness probe."""
    return HttpResponse(status=200)


def livez(_request: HttpRequest) -> HttpResponse:
    """Liveness probe (alias)."""
    return HttpResponse(status=200)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_int(raw: str | None, default: int) -> int:
    try:
        return int(raw)
    except (ValueError, TypeError):
        return default


def _parse_bool(raw: str) -> bool:
    return raw.strip().lower() in ("true", "1", "yes")
