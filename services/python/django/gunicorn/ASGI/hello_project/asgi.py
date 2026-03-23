#!/usr/bin/env python3
"""Django ASGI config for the reactive benchmarking service.

Exposes the ASGI application as ``application``.
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

from obbench_django_common.infrastructure.otel_setup import wrap_asgi_application

os.environ.setdefault("HELLO_VARIANT", "reactive")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hello_project.settings")

application = wrap_asgi_application(get_asgi_application())