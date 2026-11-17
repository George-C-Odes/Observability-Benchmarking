# Pin the scanner independently of the upstream GitHub Action wrapper.
FROM bridgecrew/checkov:3.4.5@sha256:122602cf32cc72286155d39f1f234b7b594818f7b8d7fdf490701620e521368b
USER 65532:65532
# Actions supplies its own HOME; use a writable temporary home for the scanner.
ENTRYPOINT ["/usr/bin/env", "HOME=/tmp", "/usr/local/bin/checkov"]
