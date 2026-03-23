# Django Common Benchmark Package

Shared application, cache, observability, and HTTP adapter code reused by:

- `services/python/django/gunicorn/WSGI`
- `services/python/django/gunicorn/ASGI`

## Contents

- `obbench_django_common.application` — use-case logic and ports
- `obbench_django_common.infrastructure` — cache, config, OpenTelemetry, Pyroscope
- `obbench_django_common.api` — shared sync/async Django views and health probes
- `obbench_django_common.tests` — shared 39-test suite exercised from both modules

See `docs/TESTING.md` for the current test inventory and execution commands.

## Install locally

```powershell
python -m pip install -e services/python/django/gunicorn/common
```

## Local quality checks

```powershell
cd services/python/django/gunicorn/common
python -m compileall src
python -m ruff check .
```
