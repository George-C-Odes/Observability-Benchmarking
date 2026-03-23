# Django Platform — Benchmarking Service

WSGI / Gunicorn `gthread` Django module for the Observability Benchmarking suite.

## Module layout

- `services/python/django/gunicorn/common` — shared application, cache, observability, and tests
- `services/python/django/gunicorn/WSGI` — thin platform runtime module (settings, WSGI, Gunicorn, Dockerfile)

## Endpoint

| Method | Path              | Response                                    |
|--------|-------------------|---------------------------------------------|
| `GET`  | `/hello/platform` | `"Hello from Django platform REST value-1"` |

Health probes:

- `/healthz`
- `/readyz`
- `/livez`

## Runtime model

- Django 6 on WSGI
- Gunicorn `gthread`
- Preloaded 50,000-entry shared cache via copy-on-write
- OpenTelemetry SDK initialised per worker after fork

## Tuning knobs

The module exposes only the Gunicorn settings that meaningfully affect this
platform-threaded benchmark workload:

- `DJANGO_PLATFORM_WORKERS`
- `DJANGO_PLATFORM_THREADS`
- `DJANGO_PLATFORM_BACKLOG`
- `DJANGO_PLATFORM_REUSE_PORT`

## Local quality gates

```powershell
python -m pip install ../common -r requirements.txt -r requirements-dev.txt
python -m ruff check .
python manage.py check
python manage.py test obbench_django_common.tests
```

## Running locally in IntelliJ IDEA

> **Prerequisite:** create the project virtualenv and configure the Python interpreter as
> described in `services/python/django/README.md` → *Local development (IntelliJ IDEA)*.

Use the **Django Platform** run configuration (`.run/Django Platform.run.xml`):

- **Script:** `services/python/django/gunicorn/WSGI/manage.py`
- **Parameters:** `runserver`
- **Environment:** `HELLO_VARIANT=platform`, `PYTHONUNBUFFERED=1`
- **Working directory:** `services/python/django/gunicorn/WSGI`

Select **Django Platform** from the Run dropdown and click ▶.
The development server starts on `http://127.0.0.1:8000/hello/platform`.

## Docker build

```powershell
docker buildx build `
  -f services/python/django/gunicorn/WSGI/Dockerfile `
  -t django-platform:6.0.3_latest `
  --build-arg PYTHON_VERSION=3.13.12 `
  --build-arg BUILDKIT_BUILD_NAME=django-platform:6.0.3_latest `
  --load `
  services/python/django
```