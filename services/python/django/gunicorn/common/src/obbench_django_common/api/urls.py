"""Variant-aware URL routing for the shared Django benchmark endpoints."""

from django.urls import path

from obbench_django_common.api import views
from obbench_django_common.infrastructure.config import load_config

_cfg = load_config()
_endpoint_view = views.platform if _cfg.hello_variant == "platform" else views.reactive

urlpatterns = [
    path(_cfg.hello_variant, _endpoint_view, name=f"hello-{_cfg.hello_variant}"),
    # Health probes (match Go service pattern).
    path("healthz", views.healthz, name="healthz"),
    path("readyz", views.readyz, name="readyz"),
    path("livez", views.livez, name="livez"),
]
