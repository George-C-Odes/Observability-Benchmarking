# Django Common Benchmark Package

Shared application, cache, observability, and HTTP adapter code reused by:

- `services/python/django/gunicorn/WSGI`
- `services/python/django/gunicorn/ASGI`

## Contents

- `obbench_django_common.application` — use-case logic and ports
- `obbench_django_common.infrastructure` — cache, config, OpenTelemetry, Pyroscope
- `obbench_django_common.api` — shared sync/async Django views and health probes
- `obbench_django_common.tests` — shared unit tests exercised from both modules

## Install locally

```powershell
python -m pip install -e services/python/django/gunicorn/common
```