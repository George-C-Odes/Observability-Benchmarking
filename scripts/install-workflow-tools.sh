#!/usr/bin/env bash
set -euo pipefail

# Linux x64 GitHub runners. Verify pinned release archives before executing them.
tools_dir="$RUNNER_TEMP/workflow-tools"
mkdir -p "$tools_dir"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 15 --max-time 120 --retry 2 \
  https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  -o "$tools_dir/actionlint.tar.gz"
printf '%s  %s\n' 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 "$tools_dir/actionlint.tar.gz" | sha256sum --check --strict
tar -xzf "$tools_dir/actionlint.tar.gz" -C "$tools_dir" actionlint
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 15 --max-time 120 --retry 2 \
  https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.gz \
  -o "$tools_dir/shellcheck.tar.gz"
printf '%s  %s\n' b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6 "$tools_dir/shellcheck.tar.gz" | sha256sum --check --strict
tar -xzf "$tools_dir/shellcheck.tar.gz" -C "$tools_dir" --strip-components=1 shellcheck-v0.11.0/shellcheck
echo "$tools_dir" >> "$GITHUB_PATH"
