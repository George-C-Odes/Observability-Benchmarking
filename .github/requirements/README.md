# Python CI dependency hashes

`python-ci.in` collects the existing Django runtime and development requirements,
plus the coverage and local build tools defined here. `python-ci.txt` is the single
generated hash inventory used by the shared `install-python-dependencies` action
and projected into the Django Docker build context.
The action passes this lock as a constraint file, so each job installs only its
selected requirements. A missing hash or conflicting pin fails the install.

`pip.in` and its generated `pip.txt` pin and hash the installer itself. The shared
script installs this verified wheel first because Qodana's bundled pip 24.0 does
not apply hashes from constraint files correctly. This small bootstrap lock
gives Actions and Qodana the same pip behavior without an unpinned upgrade.
The bootstrap also constrains that install with `pip.in`, so a changed pip pin
cannot silently use an outdated bootstrap lock.

`lock-compiler.in` and its generated `lock-compiler.txt` independently pin and hash
pip-tools 7.6.2 and its complete compiler dependency set. Framework Version Sync
installs this wheel-only lock from the trusted base revision before regeneration;
no unpinned compiler dependencies run in the job that later receives the publication token.
The compiler lock is not part of the Django runtime inventory or its Docker projections.

| Workflow/job          | Selected requirements                                                      |
|-----------------------|----------------------------------------------------------------------------|
| Snyk                  | Both runtime variants                                                      |
| Django common quality | Ruff from the existing development requirements                            |
| Django module quality | Selected runtime and development requirements, local build tools           |
| Django coverage       | Selected runtime and development requirements, coverage, local build tools |
| Django Qodana         | Both runtime variants excluding Pyroscope, local build tools, `qodana.in`  |

The Python version default in `setup-python/action.yml` is synchronized from
`PYTHON_VERSION` in `compose/.env`. Both Django
workflows include the shared action and requirements directory in their path
filters, and all consumers include the lock in their pip cache keys.

The shared install action enforces hashes and wheels for third-party packages.
The checked-out common package is installed separately from local source, using
the hash-verified build tools with `--no-deps --no-build-isolation --no-index`.
This permits the intended local build without downloading additional build
dependencies. Workflow steps do not upgrade pip independently.

## Regenerate or upgrade the locks

**Django framework updates:** change `DJANGO_VERSION` in `compose/.env`, then run
`node scripts/sync-framework-versions.mjs` in the Linux compiler environment described below.
It synchronizes both exact Django input pins, regenerates the runtime resolutions, and invokes
`update-lock.sh` for the verified CI inventory and Docker projections. Renovate follows this same
source-of-truth flow; do not independently upgrade Django in generated requirements or hashes.
Use `node scripts/sync-framework-versions.mjs --check` to check the complete version contract.

After changing runtime/development pins, `build.in`, `coverage.in`, `qodana.in`, or `pip.in`,
regenerate both locks from the repository root on Linux with Python 3.13 and pip-tools 7.6.2.
Use a virtualenv for the compiler:

```bash
python3.13 -m venv .venv-python-ci
source .venv-python-ci/bin/activate
python -m pip install --require-hashes --only-binary=:all: \
  --requirement .github/requirements/lock-compiler.txt \
  --constraint .github/requirements/lock-compiler.in
bash .github/requirements/update-lock.sh
```

`update-lock.sh` first upgrades pip to 26.3 using the hash-pinned `pip.in`, then
compiles both inventories and refreshes the Docker projections. Using the input
for this bootstrap permits regeneration when the generated `pip.txt` is stale.

To refresh the compiler itself, change `lock-compiler.in` if needed and run the
following in a trusted Linux compiler environment. Review and commit both files;
automatic Django updates intentionally leave this bootstrap lock unchanged.

```bash
python -m piptools compile --generate-hashes --allow-unsafe --strip-extras \
  --pip-args="--only-binary :all:" \
  --output-file=.github/requirements/lock-compiler.txt \
  .github/requirements/lock-compiler.in --upgrade
```

Runtime requirements headers retain pip-tools' actual compile command, allowing
dependency-only changes to be recompiled even when `DJANGO_VERSION` is unchanged.
`update-lock.sh` records its own command for the central hash inventories.

To refresh all versions allowed by the inputs, pass `--upgrade`:

```bash
bash .github/requirements/update-lock.sh --upgrade
```

This writes `pip.txt` and `python-ci.txt`, then regenerates the Docker-context
`gunicorn/dependencies.lock`, `gunicorn/build-requirements.txt`, and
`gunicorn/pip-requirements.txt` using the standard-library `sync_build_locks.py`.
The projection includes only runtime and local build dependencies, never Ruff,
coverage, or Qodana-only tooling. Docker installs only the selected variant's
requirements, constrained by these hashes, and bootstraps the same verified pip.
`--upgrade` does not loosen explicit
`==` pins: change the corresponding inputs first. When upgrading Django, regenerate
its runtime/development requirements before regenerating the CI inventory.

Existing runtime pins remain the installation contract; Django's framework pin is relayed
from `compose/.env`, and the hash inventory does not replace those files. Keep generated hashes out of the runtime requirements so
local development can continue installing them alongside the repository package.
Review and commit the changed inputs, CI locks, and Docker projections together.

To refresh only the Docker projections from an already-current CI inventory:

```bash
python services/python/django/gunicorn/sync_build_locks.py
python services/python/django/gunicorn/sync_build_locks.py --check
```

The Django quality workflow checks projection freshness and runs its unit tests.
Docker builds intentionally fail on conflicting pins, missing hashes, or missing
target-platform wheels; there is no fallback to third-party source builds. Local
common-package wheels are built offline in a separate build-tool virtualenv and
hash-checked before installation; that virtualenv is not copied to runtime images.

## IntelliJ run configurations (Windows / PowerShell)

The shared configurations in `.run/` use `pwsh` and `$PROJECT_DIR$` as the working
directory, following the existing Django install/upgrade naming convention:

| Configuration                                                           | Purpose                                                                                                                                  | Prerequisites                                                                  |
|-------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| [`[install] Python CI`](../../.run/%5Binstall%5D%20Python%20CI.run.xml) | Install hash-verified pip, the compiler lock (pip-tools and its dependencies), and the tools from `build.in`, `coverage.in`, and `qodana.in`; finish with `pip check`. | PowerShell 7 and Python 3.13 on the IDE process's `PATH`, preferably from a virtualenv. |
| [`[upgrade] Python CI`](../../.run/%5Bupgrade%5D%20Python%20CI.run.xml) | Regenerate both locks with `update-lock.sh --upgrade` in a disposable Linux `python:3.13.18-slim-bookworm` container using the hash-verified compiler lock. | PowerShell 7 and a running Docker daemon configured for Linux containers. |

Both configurations run `.github/requirements/python-ci.ps1` in a dedicated
PowerShell process with `-NoProfile -NoExit -File` in IntelliJ's **Run** console.
**Execute in terminal** is disabled: direct process launching avoids the Shell
Script plugin's Bash-style path escaping when the IDE terminal uses PowerShell.
Keep the interpreter as `pwsh` (resolved from `PATH`), rather than a project-relative
path into `Program Files`. Do not add quotes or backslash escapes to the interpreter field.
The script contains no `exit` statement, so the session stays open after success
or failure. It prints the operation's exit code and retains it in `$LASTEXITCODE`;
type `exit` when finished reviewing the output. Errors stop subsequent steps.
The session remains active until you close it, even after the operation completes.
If an existing IDE configuration still shows inline script text, reopen
**Run | Edit Configurations** and select the shared configuration's script file.
Confirm **Script options** is `-Action Install` or `-Action Upgrade` as appropriate;
without this option PowerShell prompts for the mandatory action.
The Debian-based upgrade image provides Bash; the Alpine image does not include it.

Both operations explicitly upgrade to hash-verified pip 26.3 before installing
the compiler. The container bootstraps from `pip.in`, and `update-lock.sh` also
performs that bootstrap when invoked directly.

The install configuration prints the interpreter path and version, rejects versions
outside Python 3.13, and targets the `python` environment on the IDE process's `PATH`; it does
not install Django or Pyroscope, nor regenerate locks. The upgrade configuration
bind-mounts only `.github/requirements` and `services/python/django/gunicorn`, so
the generated files are written back to the repository without exposing host Git metadata;
it does not install anything into the host Python environment. Linux compilation
is required for the full inventory, including Pyroscope; Git Bash with a Windows
Python interpreter is not a substitute.

After changing source pins, run **`[upgrade] Python CI`**, then
**`[install] Python CI`** to install the updated auxiliary tools locally. The exact
same upgrade can be run from PowerShell at the repository root:

```powershell
pwsh -NoProfile -NoExit -File .github/requirements/python-ci.ps1 -Action Upgrade
```

When entering an absolute executable path manually in a PowerShell terminal, use
the call operator and quote the path:

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoProfile -NoExit -File '.github/requirements/python-ci.ps1' -Action Upgrade
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
