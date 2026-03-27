# Django Reactive — Benchmarking Service

ASGI / Gunicorn + UvicornWorker Django module for the Observability Benchmarking suite.

## Module layout

- `services/python/django/gunicorn/common` — shared application, cache, observability, and tests
- `services/python/django/gunicorn/ASGI` — thin reactive runtime module (settings, ASGI, Gunicorn, Dockerfile)

## Endpoint

| Method | Path              | Response                                    |
|--------|-------------------|---------------------------------------------|
| `GET`  | `/hello/reactive` | `"Hello from Django reactive REST value-1"` |

Health probes:

- `/healthz`
- `/readyz`
- `/livez`

## Runtime model

- Django 6 on ASGI
- Gunicorn with `uvicorn.workers.UvicornWorker`
- Async view hot path with shared preloaded cache via copy-on-write
- OpenTelemetry SDK initialized per worker after fork

## Tuning knobs

The module exposes only the Gunicorn/Uvicorn settings that are meaningful for
benchmarking this workload:

- `DJANGO_REACTIVE_WORKERS`
- `DJANGO_REACTIVE_BACKLOG`
- `DJANGO_REACTIVE_REUSE_PORT`

## Local quality gates

This module executes the shared 39-test suite
`obbench_django_common.tests` from `services/python/django/gunicorn/common`,
covering both runtime modules' shared code paths. To match CI locally, run the
shared `common` checks once before the module-specific steps.

```powershell
cd ../common
python -m compileall src
python -m ruff check .

cd ../ASGI
python -m pip install ../common -r requirements.txt -r requirements-dev.txt
python -m compileall manage.py hello_project gunicorn.conf.py
python -m ruff check .
python manage.py check
$env:OTEL_SDK_DISABLED="true"
python manage.py test obbench_django_common.tests --verbosity=2
```

## Running locally in IntelliJ IDEA

> **Prerequisite:** create the project virtualenv and configure the Python interpreter as
> described in `services/python/django/README.md` → *Local development (IntelliJ IDEA)*.

Use the **Django Reactive** run configuration (`.run/Django Reactive.run.xml`):

- **Script:** `services/python/django/gunicorn/ASGI/manage.py`
- **Parameters:** `runserver`
- **Environment:** `HELLO_VARIANT=reactive`, `PYTHONUNBUFFERED=1`
- **Working directory:** `services/python/django/gunicorn/ASGI`

Select **Django Reactive** from the Run dropdown and click ▶.
The development server starts on `http://127.0.0.1:8000/hello/reactive`.

## Docker build

```powershell
docker buildx build `
  -f services/python/django/gunicorn/ASGI/Dockerfile `
  -t django-reactive:6.0.3_latest `
  --build-arg PYTHON_VERSION=3.13.12 `
  --build-arg BUILDKIT_BUILD_NAME=django-reactive:6.0.3_latest `
  --load `
  services/python/django
```