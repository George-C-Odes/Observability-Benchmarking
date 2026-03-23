"""Root URL configuration for the benchmarking hello service."""

from django.urls import include, path

from obbench_django_common.api import views

urlpatterns = [
    path("hello/", include("obbench_django_common.api.urls")),
    # Root-level health probes (matching Go service pattern).
    path("healthz", views.healthz, name="root-healthz"),
    path("readyz", views.readyz, name="root-readyz"),
    path("livez", views.livez, name="root-livez"),
]