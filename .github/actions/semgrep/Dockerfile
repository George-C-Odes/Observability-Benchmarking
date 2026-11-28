# Pin the scanner by digest; Renovate updates the version and digest together.
# The nonroot variant matches the version currently published as latest-nonroot.
FROM semgrep/semgrep:1.187.0-nonroot@sha256:36cd451db16459c30711510295052467d333ad4dd4a6b69bc8d7d7e9e3e9dae7
# The image's own semgrep user. Keep it numeric: the workflow reads this UID
# to grant workspace access to this user alone.
USER 1000:1000
# Actions supplies its own HOME; use a writable temporary home for the scanner.
# The checkout is owned by the runner UID, so trust only the mounted workspace
# for Git without writing any global configuration.
ENTRYPOINT ["/usr/bin/env", "HOME=/tmp", "GIT_CONFIG_COUNT=1", "GIT_CONFIG_KEY_0=safe.directory", "GIT_CONFIG_VALUE_0=/github/workspace", "semgrep"]
