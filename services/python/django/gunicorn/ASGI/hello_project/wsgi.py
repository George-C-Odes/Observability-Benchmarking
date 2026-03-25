#!/usr/bin/env python3
"""Django WSGI config for the benchmarking service.

Exposes the WSGI application as ``application``.
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hello_project.settings")

application = get_wsgi_application()
