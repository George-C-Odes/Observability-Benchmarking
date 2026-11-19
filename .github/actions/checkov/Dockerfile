# Pin the scanner independently of the upstream GitHub Action wrapper.
FROM bridgecrew/checkov:3.4.6@sha256:b4b7e9d419ddb9ae7a257678ee39cb5d9e5569f604723297dd9cec7fd4571bff
USER 65532:65532
# Actions supplies its own HOME; use a writable temporary home for the scanner.
ENTRYPOINT ["/usr/bin/env", "HOME=/tmp", "/usr/local/bin/checkov"]
