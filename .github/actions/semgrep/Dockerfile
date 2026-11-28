# Pin the scanner by digest; Renovate updates the version and digest together.
# The nonroot variant matches the version currently published as latest-nonroot.
FROM semgrep/semgrep:1.186.0-nonroot@sha256:9e7a5ea2466f5a9b7f308a1c6087ced2626b988869d432b326668578abf60944
USER semgrep
# Actions supplies its own HOME; use a writable temporary home for the scanner.
# The checkout is owned by the runner UID, so trust only the mounted workspace
# for Git without writing any global configuration.
ENTRYPOINT ["/usr/bin/env", "HOME=/tmp", "GIT_CONFIG_COUNT=1", "GIT_CONFIG_KEY_0=safe.directory", "GIT_CONFIG_VALUE_0=/github/workspace", "semgrep"]
