#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# Bootstrap from the hash-pinned input so changing pip.in can repair a stale pip.txt.
echo 'Installing hash-verified pip 26.3...'
python -m pip install --upgrade --require-hashes --only-binary=:all: --no-deps \
  --requirement .github/requirements/pip.in

export CUSTOM_COMPILE_COMMAND='bash .github/requirements/update-lock.sh'
python -m piptools compile --generate-hashes --allow-unsafe --strip-extras \
  --pip-args="--only-binary :all:" \
  --output-file=.github/requirements/pip.txt \
  .github/requirements/pip.in "$@"
python -m piptools compile --generate-hashes --allow-unsafe --strip-extras \
  --pip-args="--only-binary :all:" \
  --output-file=.github/requirements/python-ci.txt \
  .github/requirements/python-ci.in "$@"
python services/python/django/gunicorn/sync_build_locks.py
