#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

export CUSTOM_COMPILE_COMMAND='bash .github/requirements/update-lock.sh'
python -m piptools compile --generate-hashes --allow-unsafe --strip-extras \
  --pip-args="--only-binary :all:" \
  --output-file=.github/requirements/python-ci.txt \
  .github/requirements/python-ci.in "$@"
