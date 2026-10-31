# Python CI dependency hashes

`python-ci.in` collects the existing Django runtime and development requirements,
plus the coverage and local build tools defined here. `python-ci.txt` is the single
generated hash inventory used by the shared `install-python-dependencies` action.
The action passes this lock as a constraint file, so each job installs only its
selected requirements. A missing hash or conflicting pin fails the install.

`pip.in` and its generated `pip.txt` pin and hash the installer itself. The shared
script installs this verified wheel first because Qodana's bundled pip 24.0 does
not apply hashes from constraint files correctly. This small bootstrap lock
gives Actions and Qodana the same pip behavior without an unpinned upgrade.
The bootstrap also constrains that install with `pip.in`, so a changed pip pin
cannot silently use an outdated bootstrap lock.

| Workflow/job          | Selected requirements                                                      |
|-----------------------|----------------------------------------------------------------------------|
| Snyk                  | Both runtime variants                                                      |
| Django common quality | Ruff from the existing development requirements                            |
| Django module quality | Selected runtime and development requirements, local build tools           |
| Django coverage       | Selected runtime and development requirements, coverage, local build tools |
| Django Qodana         | Both runtime variants excluding Pyroscope, local build tools, `qodana.in`  |

The Python version defaults to 3.13 in `setup-python/action.yml`. Both Django
workflows include the shared action and requirements directory in their path
filters, and all consumers include the lock in their pip cache keys.

The shared install action enforces hashes and wheels for third-party packages.
The checked-out common package is installed separately from local source, using
the hash-verified build tools with `--no-deps --no-build-isolation --no-index`.
This permits the intended local build without downloading additional build
dependencies. Workflow steps do not upgrade pip independently.

## Regenerate or upgrade the locks

After changing runtime/development pins, `build.in`, `coverage.in`, `qodana.in`, or `pip.in`,
regenerate both locks from the repository root on Linux with Python 3.13 and pip-tools 7.6.2.
Use a virtualenv for the compiler:

```bash
python3.13 -m venv .venv-python-ci
source .venv-python-ci/bin/activate
python -m pip install --upgrade pip-tools==7.6.2
bash .github/requirements/update-lock.sh
```

To refresh all versions allowed by the inputs, pass `--upgrade`:

```bash
bash .github/requirements/update-lock.sh --upgrade
```

This writes `pip.txt` and `python-ci.txt`. `--upgrade` does not loosen explicit
`==` pins: change the corresponding inputs first. When upgrading Django, regenerate
its runtime/development requirements before regenerating the CI inventory.

Existing runtime pins remain the source of truth; the hash inventory does not
replace those files. Keep generated hashes out of the runtime requirements so
local development can continue installing them alongside the repository package.
Review and commit the changed inputs and both regenerated locks together.

## IntelliJ run configurations (Windows / PowerShell)

The shared configurations in `.run/` use `pwsh` and `$PROJECT_DIR$` as the working
directory, following the existing Django install/upgrade naming convention:

| Configuration                                                           | Purpose                                                                                                                                  | Prerequisites                                                                  |
|-------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| [`[install] Python CI`](../../.run/%5Binstall%5D%20Python%20CI.run.xml) | Install hash-verified pip, pip-tools 7.6.2, and the tools from `build.in`, `coverage.in`, and `qodana.in`; finish with `pip check`.      | PowerShell 7 and Python 3.13 on `PATH`, preferably in an activated virtualenv. |
| [`[upgrade] Python CI`](../../.run/%5Bupgrade%5D%20Python%20CI.run.xml) | Regenerate both locks with `update-lock.sh --upgrade` in a disposable Linux `python:3.13-slim-bookworm` container using pip-tools 7.6.2. | PowerShell 7 and a running Docker daemon configured for Linux containers.      |

The install configuration targets the selected local `python` environment; it does
not install Django or Pyroscope, nor regenerate locks. The upgrade configuration
bind-mounts the checkout, so the generated files are written back to the repository;
it does not install anything into the host Python environment. Linux compilation
is required for the full inventory, including Pyroscope; Git Bash with a Windows
Python interpreter is not a substitute.

After changing source pins, run **`[upgrade] Python CI`**, then
**`[install] Python CI`** to install the updated auxiliary tools locally. The exact
same upgrade can be run from PowerShell at the repository root:

```powershell
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/workspace" --workdir /workspace python:3.13-slim-bookworm bash -lc 'set -euo pipefail; python -m pip install pip-tools==7.6.2; bash .github/requirements/update-lock.sh --upgrade'
```

## Exercise the shared CI installer

To exercise the shared installer from the repository root in a clean Linux
Python 3.13 virtualenv:

```bash
export REQUIREMENTS=$'services/python/django/gunicorn/WSGI/requirements.txt\nservices/python/django/gunicorn/WSGI/requirements-dev.txt\n.github/requirements/coverage.in'
export LOCAL_PROJECT=services/python/django/gunicorn/common
export EDITABLE=true
bash .github/actions/install-python-dependencies/install.sh
```

Go, Java, and Next.js coverage workflows use Python's standard library only;
they have no pip dependencies to lock. CodeQL analyzes Python without a Python
dependency-install step.

The Qodana bootstrap uses the same installer and hash inventory through read-only
mounts at `/opt/python-ci/installer` and `/opt/python-ci/requirements`. The installer
accepts `PYTHON_COMMAND` and `PYTHON_CI_REQUIREMENTS_DIR` for this container; normal
Actions consumers retain their defaults. Qodana filters Pyroscope packages and
sets `PIP_IGNORE_REQUIRES_PYTHON=1` only for import analysis with its older Python.
The common package is built from a temporary copy, leaving the checkout clean.
See `services/python/django/README.md` for local container commands including the
required mounts. Missing shared assets fail the bootstrap; there is no unhashed
fallback.

The unmodified Qodana 2026.2 image also bundles `virtualenv` requiring
`platformdirs>=4.4,<5` alongside `platformdirs==3.10.0`. `qodana.in` pins a
compatible wheel in the shared inventory so `pip check` remains enabled. This
analyzer-only input is not installed by the Django test or Snyk jobs.
