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

After changing runtime/development pins, `build.in`, `coverage.in`, `qodana.in`, or `pip.in`,
regenerate both locks with Python 3.13 and pip-tools (generated using 7.6.1) on Linux:

```bash
bash .github/requirements/update-lock.sh
```

Existing runtime pins remain the source of truth; the hash inventory does not
replace those files. Keep generated hashes out of the runtime requirements so
local development can continue installing them alongside the repository package.

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
