<!-- Generated from `services/python/django/README.template.md` via `scripts/render-readmes.mjs`. Do not edit `services/python/django/README.md` directly. -->

# Django Benchmark Modules

Gunicorn {{GUNICORN_VERSION}} is pinned from `compose/.env` and relayed to both runtime requirements and the shared CI locks.

Django {{DJANGO_VERSION}} benchmark implementations use Python {{PYTHON_VERSION}} and are organized under a common Gunicorn-oriented layout.

## Structure

- `services/python/django/gunicorn/common` — shared application package, cache, observability, and tests
- `services/python/django/gunicorn/WSGI` — platform-threaded Django module served via Gunicorn `gthread`
- `services/python/django/gunicorn/ASGI` — reactive Django module served via Gunicorn with `UvicornWorker`

## Image / service names

The runtime naming conventions remain unchanged:

- `django-platform`
- `django-reactive`

## Build and runtime security

- The API adapter explicitly accepts **GET and HEAD** on `/healthz`, `/readyz`,
  and `/livez`; other methods return `405` with `Allow: GET, HEAD`. Benchmark
  endpoints, cache behavior, worker counts, and telemetry remain unchanged.
- Docker installs third-party dependencies and pip from hash-verified wheels.
  `gunicorn/dependencies.lock` is generated from the central CI inventory, not a
  second version source; only the selected runtime's requirements are installed.
  A missing target-platform wheel fails the build instead of executing a source
  build. See [the dependency-lock guide](../../../.github/requirements/README.md).
- The trusted common package is built with pinned, hash-verified tools in a
  separate build virtualenv with networking and isolated dependency fetching
  disabled. Its local wheel is hash-checked before installation. Neither build
  tools nor compilers are copied into the nonroot runtime image.
- Gunicorn's infrastructure startup hook creates an owned `0700` heartbeat
  directory at `/dev/shm/obbench-gunicorn` **after** Docker mounts tmpfs. This
  preserves memory-backed heartbeat I/O. The control socket is inside the image's
  owned `0700` `/app/gunicorn-control` directory, not public `/tmp`.
  Both paths are checked for ownership, permissions, and final-component symlinks
  before workers start; unsafe existing directories cause startup to fail.
- `GUNICORN_WORKER_TMP_DIR` and `GUNICORN_CONTROL_SOCKET` can override these paths
  for Unix host runs. Use absolute paths with existing, trusted parent directories;
  keep the heartbeat path on tmpfs. The runtime-directory helper stays in the
  infrastructure layer, while method policy stays in the API layer. Application
  and domain code have no new filesystem or server dependencies.

Sonar may still identify the `/dev/shm` literals as security hotspots because
static analysis cannot prove startup ownership/permission checks. Review these
as safe only after validating the private-directory hook and runtime permissions;
do not suppress the rule globally or move heartbeat files onto overlayfs.

## Version source and updates

Set `PYTHON_VERSION` and `DJANGO_VERSION` in [compose/.env](../../../compose/.env), then run **[doc] Render Updates** in IntelliJ to refresh the generated documentation, Dockerfile defaults, and build image configurations.

For a documentation-only refresh, run from the repository root:

```powershell
node scripts/render-readmes.mjs
node scripts/render-readmes.mjs --check
```

Edit the sibling `README.template.md` files when changing this guide or the ASGI/WSGI READMEs. Django dependency pins in the runtime requirements files must still be updated separately when upgrading Django.

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

First update `pip-tools` in the active Python environment. This is required with newer `pip` releases because older `pip-tools` versions call a removed pip API. Then re-compile lock files with the latest compatible versions for **all** Django modules (run from the repository root):

```powershell
python -m pip install --upgrade pip-tools
python -m piptools compile --upgrade services/python/django/gunicorn/WSGI/requirements.in -o services/python/django/gunicorn/WSGI/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'WSGI dependency compilation failed.' }
python -m piptools compile --upgrade services/python/django/gunicorn/ASGI/requirements.in -o services/python/django/gunicorn/ASGI/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'ASGI dependency compilation failed.' }
```

After changing runtime pins, run **`[upgrade] Python CI`** (Linux container), or
follow the [central lock regeneration guide](../../../.github/requirements/README.md).
The shared updater regenerates the Docker-context locks automatically. Commit
the runtime pins, central hashes, and generated Docker locks together. To check
the Docker projection without fetching or upgrading any dependencies:

```powershell
python services/python/django/gunicorn/sync_build_locks.py --check
python -m unittest discover -s services/python/django/gunicorn -p test_sync_build_locks.py -v
```

Then re-install into the local virtualenv (filtering out `pyroscope-io` which only builds on Linux):

```powershell
(Get-Content services\python\django\gunicorn\WSGI\requirements.txt, `
              services\python\django\gunicorn\ASGI\requirements.txt) `
    -notmatch 'pyroscope' | Set-Content $env:TEMP\django-reqs.txt
pip install -e services\python\django\gunicorn\common -r $env:TEMP\django-reqs.txt
```

## Run quality gates locally

The Django GitHub Actions setup is split into two workflows:

- `.github/workflows/django_python_quality.yml` — shared/package syntax checks, Ruff lint and format checks, Django system checks, unit tests, and Qodana
- `.github/workflows/django_python_coverage.yml` — per-runtime `coverage.py` runs, GitHub Step Summary tables, artifacts, and Codecov upload

The shared Django test suite now covers both runtime modules plus the thin runtime entrypoints (`manage.py`, `hello_project/*.py`) and Gunicorn hook/config helpers.

### Shared package checks

Run the following from the **repository root**; the final `cd ../../../../../` returns you to the repository root.
```powershell
cd services/python/django/gunicorn/common; python -m compileall src; python -m ruff --version; python -m ruff check .; python -m ruff format --check .; cd ../../../../../
```

### WSGI module checks

```powershell
cd services/python/django/gunicorn/WSGI; python -m pip install ../common -r requirements.txt -r requirements-dev.txt; python -m compileall manage.py hello_project gunicorn.conf.py; python -m ruff --version; python -m ruff check .; python -m ruff format --check .; python manage.py check; $env:OTEL_SDK_DISABLED="true"; python manage.py test obbench_django_common.tests --verbosity=2; cd ../../../../../
```

### ASGI module checks

```powershell
cd services/python/django/gunicorn/ASGI; python -m pip install ../common -r requirements.txt -r requirements-dev.txt; python -m compileall manage.py hello_project gunicorn.conf.py; python -m ruff --version; python -m ruff check .; python -m ruff format --check .; python manage.py check; $env:OTEL_SDK_DISABLED="true"; python manage.py test obbench_django_common.tests --verbosity=2; cd ../../../../../
```

If you only want the shared unit suite, the final `python manage.py test
obbench_django_common.tests --verbosity=2` command can be executed from either
module directory.

## Run coverage locally

The coverage workflow uses `coverage.py` with branch coverage and uploads `coverage.xml` to Codecov for both runtime modules.

### WSGI coverage (PowerShell)

```powershell
python -m pip install coverage[toml]
(Get-Content services\python\django\gunicorn\WSGI\requirements.txt) `
    | Where-Object { $_ -notmatch 'pyroscope' } `
    | Set-Content $env:TEMP\django-wsgi-reqs.txt

python -m pip install `
    -e services\python\django\gunicorn\common `
    -r $env:TEMP\django-wsgi-reqs.txt `
    -r services\python\django\gunicorn\WSGI\requirements-dev.txt

$env:OTEL_SDK_DISABLED = 'true'
$env:PYROSCOPE_ENABLED = 'false'
$env:COVERAGE_FILE = 'services/python/django/gunicorn/WSGI/.coverage'

python -m coverage run --branch `
    --source="services/python/django/gunicorn/WSGI,services/python/django/gunicorn/common/src/obbench_django_common" `
    --omit="*/tests/*" `
    services/python/django/gunicorn/WSGI/manage.py test obbench_django_common.tests --verbosity=2

python -m coverage report -m
python -m coverage xml -o services/python/django/gunicorn/WSGI/coverage.xml
python -m coverage html -d services/python/django/gunicorn/WSGI/htmlcov
```

### ASGI coverage (PowerShell)

```powershell
python -m pip install coverage[toml]
(Get-Content services\python\django\gunicorn\ASGI\requirements.txt) `
    | Where-Object { $_ -notmatch 'pyroscope' } `
    | Set-Content $env:TEMP\django-asgi-reqs.txt

python -m pip install `
    -e services\python\django\gunicorn\common `
    -r $env:TEMP\django-asgi-reqs.txt `
    -r services\python\django\gunicorn\ASGI\requirements-dev.txt

$env:OTEL_SDK_DISABLED = 'true'
$env:PYROSCOPE_ENABLED = 'false'
$env:COVERAGE_FILE = 'services/python/django/gunicorn/ASGI/.coverage'

python -m coverage run --branch `
    --source="services/python/django/gunicorn/ASGI,services/python/django/gunicorn/common/src/obbench_django_common" `
    --omit="*/tests/*" `
    services/python/django/gunicorn/ASGI/manage.py test obbench_django_common.tests --verbosity=2

python -m coverage report -m
python -m coverage xml -o services/python/django/gunicorn/ASGI/coverage.xml
python -m coverage html -d services/python/django/gunicorn/ASGI/htmlcov
```

> On Windows, `pyroscope-io` requires a native Rust toolchain and may fail to build locally, so the commands above filter out `pyroscope*` dependencies before installing requirements. The CI coverage workflow runs on Ubuntu and installs the full dependency set there.

See `docs/TESTING.md` for the per-file breakdown and coverage notes.

## Qodana static analysis

The CI workflow includes a [Qodana Python Community](https://www.jetbrains.com/qodana/) scan that runs PyCharm Community-based inspections on code under `services/python/django/`. The Community image tag and immutable digest are centralized in `services/python/django/qodana.yaml` and maintained by Renovate. The scan enforces the same blocking quality gate as the JVM scopes (`critical: 0`, `high: 0`, `moderate: 0`). No paid linter or Qodana token is needed.

The recommended profile is extended with unresolved-reference, type-checker, call-argument, dataclass, and Python 3.13 compatibility inspections. Missing type hints are checked in shared production code, not test methods. These inspections can produce false positives with dynamic Python: keep any reviewed suppressions narrowly scoped. The coverage helper requires at least 112 enabled inspections and checks mandatory inspection IDs, rather than treating a zero-finding report as proof of coverage.

Compatibility versions use the repository-managed XML settings in `quality/`, copied into the disposable project's default inspection profile during bootstrap. Qodana's legacy list option cannot be overridden reliably with scalar YAML. The runner explicitly selects the bundled interpreter via `QODANA_PYTHON_PATH` so imports and type checks do not silently run without an SDK.

The `qodana.yaml` bootstrap uses the shared Python CI installer and hash inventory to install Django, OpenTelemetry, gunicorn, cachetools, and the local `obbench-django-common` package for import resolution. Third-party dependencies and local build tools require verified hashes and wheels. The local package is built from a temporary copy with dependency fetching disabled. Pyroscope packages remain excluded from this analysis-only environment, and the bootstrap permits the analyzer's older Python interpreter through `PIP_IGNORE_REQUIRES_PYTHON=1`.

`scripts/run-qodana-python.py` runs Docker as a non-root user with all capabilities dropped and privilege escalation disabled. It validates the Django root and intermediate directories before copying, rejecting symlink/junction redirection, and creates a disposable source copy without host IDE metadata, virtualenvs, caches, build output, or local `.env` files. No host Git directories, configuration, history, or `.git` pointer enter the container. The host adds revision, attached branch, and a sanitized network repository URI to exported SARIF after analysis; userinfo, query strings, and fragments are stripped, and local/unsupported remote paths are omitted. Shared requirements and the installer are mounted read-only under `/opt/python-ci`, outside the Django analysis root; missing assets fail the bootstrap instead of falling back to an unhashed install.

Qodana runs independently of common lint checks and has no `continue-on-error` allowance. HTML report and diagnostic uploads run even after a failed scan. The existing `qodana-report-django-python` artifact remains compatible with Pages; `qodana-diagnostics-django-python` retains scanner logs, SARIF, and inspection summaries. GitHub Step Summary shows enabled-inspection coverage and regressions fail the job.

### Run Qodana locally

```powershell
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { python -c "import tempfile; print(tempfile.gettempdir())" }
$results = Join-Path $tempRoot 'qodana-python/results'
python scripts/run-qodana-python.py --results-dir "$results"
$scanExit = $LASTEXITCODE
python scripts/qodana-python-report.py "$results"
$coverageExit = $LASTEXITCODE
if ($scanExit -ne 0 -or $coverageExit -ne 0) { throw "Qodana failed; inspect $results/scan.log and the report." }
```

Each scan requires an empty results directory so stale reports cannot mask failures. Run the summary helper even when the scanner fails; both scanner and coverage-check exit codes are meaningful.

The HTML report is published to GitHub Pages after completed successful or failed runs on `main` when the report artifact is available. Quality-gate failures remain blocking; Pages shows their findings instead of falling back to an older successful scan:

```text
https://george-c-odes.github.io/Observability-Benchmarking/quality/django-python/
```

See `docs/LINTING_AND_CODE_QUALITY.md` for full details including bash equivalents.

## Lint and format check locally

Run [Ruff](https://docs.astral.sh/ruff/) across **all** Django modules (from the repository root):

All three configurations select `E`, `F`, `I`, `S` (security), `B` (bugbear), and `ASYNC`. File-scoped exceptions preserve intentional container-interface binding and the startup-validated private tmpfs heartbeat directory; security checks remain active elsewhere.

```powershell
python -m ruff --version
python -m ruff check services/python/django/gunicorn/common services/python/django/gunicorn/WSGI services/python/django/gunicorn/ASGI
python -m ruff format --check services/python/django/gunicorn/common services/python/django/gunicorn/WSGI services/python/django/gunicorn/ASGI
```

Auto-fix any fixable issues (e.g., import sorting):

```powershell
python -m ruff check --fix services/python/django/gunicorn/common services/python/django/gunicorn/WSGI services/python/django/gunicorn/ASGI
python -m ruff format services/python/django/gunicorn/common services/python/django/gunicorn/WSGI services/python/django/gunicorn/ASGI
```

## Docker builds

```powershell
docker buildx build `
    -f services/python/django/gunicorn/WSGI/Dockerfile `
    -t {{DJANGO_PLATFORM_IMAGE}} `
    --build-arg PYTHON_VERSION={{PYTHON_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME={{DJANGO_PLATFORM_IMAGE}} `
    --load `
    services/python/django

docker buildx build `
    -f services/python/django/gunicorn/ASGI/Dockerfile `
    -t {{DJANGO_REACTIVE_IMAGE}} `
    --build-arg PYTHON_VERSION={{PYTHON_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME={{DJANGO_REACTIVE_IMAGE}} `
    --load `
    services/python/django
```

## Local coverage gate

Run `make build` or `make coverage` from `gunicorn/WSGI`, `gunicorn/ASGI`, or
`gunicorn/common` after installing the runtime requirements, common package, and
`coverage`. The runtime targets gate their wrapper and shared package separately;
the common target checks its code under both runtimes. Thresholds come from
`scripts/coverage-thresholds.json`. Use `PYTHON=python3` if needed.
