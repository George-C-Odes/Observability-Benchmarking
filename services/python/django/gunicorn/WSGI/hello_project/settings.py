"""
Django settings for the benchmarking hello service.

Django 6.0.4 — WSGI mode, tuned for throughput benchmarks.
https://docs.djangoproject.com/en/6.0/ref/settings/
"""

import os

os.environ.setdefault("HELLO_VARIANT", "platform")

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "benchmarking-not-a-secret-not-for-production",
)

DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = ["*"]

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    # Absolute minimum — no admin, no sessions, no auth, no CSRF,
    # no contenttypes (no database at all).
    "obbench_django_common.apps.BenchmarkHelloConfig",
]

MIDDLEWARE = [
    # Minimal middleware stack for raw throughput.
    # DjangoInstrumentor adds its tracing middleware programmatically
    # at startup (see otel_setup.instrument_app()).
]

ROOT_URLCONF = "hello_project.urls"

# Disable APPEND_SLASH — our URLs never use a trailing slash, so this avoids
# the redirect-check overhead on every request.
APPEND_SLASH = False

WSGI_APPLICATION = "hello_project.wsgi.application"

# ---------------------------------------------------------------------------
# Database — none required for this benchmark service
# ---------------------------------------------------------------------------
DATABASES = {}

# ---------------------------------------------------------------------------
# Templates — disabled (pure JSON API)
# ---------------------------------------------------------------------------
TEMPLATES = []

# ---------------------------------------------------------------------------
# Internationalisation — minimal
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = os.environ.get("TZ", "UTC")
USE_I18N = False
USE_TZ = False

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

# NOTE: OTel LoggingHandler (OTLP log export to Alloy → Loki) is added
# per-worker by otel_setup.configure_sdk() in the post_fork hook.
# It is NOT configured here because the OTel SDK is not yet initialized
# at settings-load time (it must be created per-worker after fork).

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "obbench_django_common.infrastructure.log_formatter.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    # Clear root handlers.  opentelemetry-instrument used to add both a
    # LoggingHandler (OTLP export) *and* a StreamHandler (console) to
    # root before Django loads.  We now manage OTel handlers explicitly
    # per-worker, so keep root clean to avoid duplicate lines.
    "root": {
        "handlers": [],
        "level": "WARNING",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "hello": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
    },
}

# ---------------------------------------------------------------------------
# Default primary key field type
# ---------------------------------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Security — relaxed for local benchmark use only
# ---------------------------------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = False
