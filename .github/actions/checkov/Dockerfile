# Pin the scanner independently of the upstream GitHub Action wrapper.
FROM bridgecrew/checkov:3.4.11@sha256:68da9ede242807850ab346b533dc1e4d2b00e15a9e6b4b595654d39c7f2e2566
USER 65532:65532
# Actions supplies its own HOME; use a writable temporary home for the scanner.
ENTRYPOINT ["/usr/bin/env", "HOME=/tmp", "/usr/local/bin/checkov"]
