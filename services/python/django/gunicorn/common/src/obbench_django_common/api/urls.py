"""Variant-aware URL routing for the shared Django benchmark endpoints."""

from collections.abc import Callable
from typing import Any

from django.urls import path

from obbench_django_common.api import views
from obbench_django_common.infrastructure.config import load_config

_cfg = load_config()
# Django accepts either sync or async results; its overloads cannot distribute
# over a union of the two function signatures. Keep the callable contract explicit.
_endpoint_view: Callable[..., Any] = (
    views.platform if _cfg.hello_variant == "platform" else views.reactive
)

urlpatterns = [
    path(_cfg.hello_variant, _endpoint_view, name=f"hello-{_cfg.hello_variant}"),
    # Health probes (match Go service pattern).
    path("healthz", views.healthz, name="healthz"),
    path("readyz", views.readyz, name="readyz"),
    path("livez", views.livez, name="livez"),
]
