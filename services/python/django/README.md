# Django Benchmark Modules

Django-based benchmark implementations are organized under a common Gunicorn-oriented layout.

## Structure

- `services/python/django/gunicorn/common` — shared application package, cache, observability, and tests
- `services/python/django/gunicorn/WSGI` — platform-threaded Django module served via Gunicorn `gthread`
- `services/python/django/gunicorn/ASGI` — reactive Django module served via Gunicorn with `UvicornWorker`

## Image / service names

The runtime naming conventions remain unchanged:

- `django-platform`
- `django-reactive`

## Local development (IntelliJ IDEA)

### Prerequisites

1. **Python 3.13+** installed and on `PATH`.
2. **IntelliJ IDEA** with the **Python** plugin (bundled in PyCharm, or install *Python Community Edition* plugin in IntelliJ Ultimate/Community).

### Create and populate the project virtualenv

The shared IntelliJ run configurations expect a virtualenv at the **repository root** (`.venv`).
Run the following **once** from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install the shared common package and each module's dependencies.
# pyroscope-io requires a native Rust toolchain and only builds on Linux;
# filter it out for local development — the app handles its absence gracefully.
(Get-Content services\python\django\gunicorn\WSGI\requirements.txt, `
              services\python\django\gunicorn\ASGI\requirements.txt) `
    -notmatch 'pyroscope' | Set-Content $env:TEMP\django-reqs.txt
pip install -e services\python\django\gunicorn\common -r $env:TEMP\django-reqs.txt

# Dev/lint tooling (optional but recommended)
pip install -r services/python/django/gunicorn/WSGI/requirements-dev.txt
```

### Configure the Python interpreter in IntelliJ

1. **File → Project Structure → Modules** (or **Settings → Project → Python Interpreter**).
2. Select the `services-python` module (or the project).
3. Set the interpreter to the existing virtualenv at `<repo-root>/.venv/Scripts/python.exe`.
4. Apply — this resolves the *"No Python Interpreter configured for module"* warning.

### Run configurations

Pre-configured run configurations are provided in the `.run/` directory:

| Configuration       | Script                                           | `HELLO_VARIANT` | Subcommand  |
|---------------------|--------------------------------------------------|-----------------|-------------|
| **Django Platform** | `services/python/django/gunicorn/WSGI/manage.py` | `platform`      | `runserver` |
| **Django Reactive** | `services/python/django/gunicorn/ASGI/manage.py` | `reactive`      | `runserver` |

Select either configuration from the IntelliJ **Run** dropdown and click ▶ to start the Django development server locally.

## Upgrade dependencies

Re-compile lock files with the latest compatible versions for **all** Django modules (run from the repository root):

```powershell
pip-compile --upgrade services/python/django/gunicorn/WSGI/requirements.in -o services/python/django/gunicorn/WSGI/requirements.txt; pip-compile --upgrade services/python/django/gunicorn/ASGI/requirements.in -o services/python/django/gunicorn/ASGI/requirements.txt
```

Then re-install into the local virtualenv (filtering out `pyroscope-io` which only builds on Linux):

```powershell
(Get-Content services\python\django\gunicorn\WSGI\requirements.txt, `
              services\python\django\gunicorn\ASGI\requirements.txt) `
    -notmatch 'pyroscope' | Set-Content $env:TEMP\django-reqs.txt
pip install -e services\python\django\gunicorn\common -r $env:TEMP\django-reqs.txt
```

## Run quality gates locally

The Django CI workflow validates the shared `common` package once, then runs
module-specific syntax checks, Ruff, Django system checks, and the shared
39-test suite from both runtime modules.

### Shared package checks

```powershell
cd services/python/django/gunicorn/common
python -m compileall src
python -m ruff check .
cd ../../../..
```

### WSGI module checks

```powershell
cd services/python/django/gunicorn/WSGI
python -m pip install ../common -r requirements.txt -r requirements-dev.txt
python -m compileall manage.py hello_project gunicorn.conf.py
python -m ruff check .
python manage.py check
$env:OTEL_SDK_DISABLED="true"
python manage.py test obbench_django_common.tests --verbosity=2
cd ../../../../..
```

### ASGI module checks

```powershell
cd services/python/django/gunicorn/ASGI
python -m pip install ../common -r requirements.txt -r requirements-dev.txt
python -m compileall manage.py hello_project gunicorn.conf.py
python -m ruff check .
python manage.py check
$env:OTEL_SDK_DISABLED="true"
python manage.py test obbench_django_common.tests --verbosity=2
cd ../../../../..
```

If you only want the shared unit suite, the final `python manage.py test
obbench_django_common.tests --verbosity=2` command can be executed from either
module directory.

See `docs/TESTING.md` for the per-file breakdown and coverage notes.

## Lint locally

Run [Ruff](https://docs.astral.sh/ruff/) across **all** Django modules (from the repository root):

```powershell
python -m ruff check services/python/django/gunicorn/common services/python/django/gunicorn/WSGI services/python/django/gunicorn/ASGI
```

Auto-fix any fixable issues (e.g. import sorting):

```powershell
python -m ruff check --fix services/python/django/gunicorn/common services/python/django/gunicorn/WSGI services/python/django/gunicorn/ASGI
```

## Docker builds

```powershell
docker buildx build `
    -f services/python/django/gunicorn/WSGI/Dockerfile `
    -t django-platform:6.0.3_latest `
    --build-arg PYTHON_VERSION=3.13.12 `
    --build-arg BUILDKIT_BUILD_NAME=django-platform:6.0.3_latest `
    --load `
    services/python/django

docker buildx build `
    -f services/python/django/gunicorn/ASGI/Dockerfile `
    -t django-reactive:6.0.3_latest `
    --build-arg PYTHON_VERSION=3.13.12 `
    --build-arg BUILDKIT_BUILD_NAME=django-reactive:6.0.3_latest `
    --load `
    services/python/django
```