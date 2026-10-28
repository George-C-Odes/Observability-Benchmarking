# Python CI dependency hashes

`python-ci.in` collects the existing Django runtime and development requirements,
plus the coverage and local build tools defined here. `python-ci.txt` is the single
generated hash inventory used by the shared `install-python-dependencies` action.
The action passes this lock as a constraint file, so each job installs only its
selected requirements. A missing hash or conflicting pin fails the install.

| Workflow/job          | Selected requirements                                                      |
|-----------------------|----------------------------------------------------------------------------|
| Snyk                  | Both runtime variants                                                      |
| Django common quality | Ruff from the existing development requirements                            |
| Django module quality | Selected runtime and development requirements, local build tools           |
| Django coverage       | Selected runtime and development requirements, coverage, local build tools |

The Python version defaults to 3.13 in `setup-python/action.yml`. Both Django
workflows include the shared action and requirements directory in their path
filters, and all consumers include the lock in their pip cache keys.

The shared install action enforces hashes and wheels for third-party packages.
The checked-out common package is installed separately from local source, using
the hash-verified build tools with `--no-deps --no-build-isolation --no-index`.
This permits the intended local build without downloading additional build
dependencies. Workflow steps do not upgrade pip independently.

After changing runtime/development pins, `build.in`, or `coverage.in`, regenerate
the lock with Python 3.13 and pip-tools (generated using 7.6.1) on Linux:

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

The Qodana job has a separate bootstrap in
`services/python/django/qodana.yaml`. It runs inside the analyzer container,
filters Pyroscope packages, and ignores Python version requirements for import
resolution. That bootstrap has not been migrated to this installer; adopting the
shared lock there needs validation against the analyzer's Python environment.
