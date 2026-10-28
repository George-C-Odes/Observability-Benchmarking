#!/usr/bin/env bash
set -euo pipefail

python_command=${PYTHON_COMMAND:-python}
requirements_dir=${PYTHON_CI_REQUIREMENTS_DIR:-.github/requirements}
args=(--constraint "$requirements_dir/python-ci.txt")
count=0
while IFS= read -r requirement || [[ -n "$requirement" ]]; do
  requirement=${requirement%$'\r'}
  [[ -z "$requirement" ]] && continue
  args+=(--requirement "$requirement")
  count=$((count + 1))
done <<< "$REQUIREMENTS"

if [[ "$count" -eq 0 ]]; then
  echo '::error::At least one requirements file is required.'
  exit 1
fi
if [[ "$EDITABLE" != 'true' && "$EDITABLE" != 'false' ]]; then
  echo '::error::editable must be true or false.'
  exit 1
fi
if [[ -n "$LOCAL_PROJECT" ]]; then
  args+=(--requirement "$requirements_dir/build.in")
fi
# Qodana bundles an older pip that does not apply constraint hashes correctly.
# Bootstrap a verified pip wheel before using the shared dependency inventory.
"$python_command" -m pip install --require-hashes --only-binary :all: --no-deps \
  --constraint "$requirements_dir/pip.in" \
  --requirement "$requirements_dir/pip.txt"
"$python_command" -m pip install --require-hashes --only-binary :all: "${args[@]}"

if [[ -n "$LOCAL_PROJECT" ]]; then
  # The checked-out repository package is deliberately built from local source.
  # Its build tools were hash-verified above; disable dependency fetching and
  # build isolation so this step cannot download unverified build dependencies.
  args=()
  if [[ "$EDITABLE" == 'true' ]]; then
    args+=(--editable "$LOCAL_PROJECT")
  else
    args+=("$LOCAL_PROJECT")
  fi
  "$python_command" -m pip install --no-deps --no-build-isolation --no-index --only-binary :all: "${args[@]}"
fi
"$python_command" -m pip check
