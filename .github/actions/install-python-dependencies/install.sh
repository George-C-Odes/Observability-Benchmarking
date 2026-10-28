#!/usr/bin/env bash
set -euo pipefail

args=(--require-hashes --only-binary :all: --constraint .github/requirements/python-ci.txt)
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
  args+=(--requirement .github/requirements/build.in)
fi
python -m pip install "${args[@]}"

if [[ -n "$LOCAL_PROJECT" ]]; then
  # The checked-out repository package is deliberately built from local source.
  # Its build tools were hash-verified above; disable dependency fetching and
  # build isolation so this step cannot download unverified build dependencies.
  args=(--no-deps --no-build-isolation --no-index --only-binary :all:)
  if [[ "$EDITABLE" == 'true' ]]; then
    args+=(--editable "$LOCAL_PROJECT")
  else
    args+=("$LOCAL_PROJECT")
  fi
  python -m pip install "${args[@]}"
fi
python -m pip check
