# Pin the scanner independently of the upstream GitHub Action wrapper.
FROM bridgecrew/checkov:3.4.7@sha256:2df9b825a73bf4d09f0ab0d71b12844801454c3c35430162e7e2cf0e60e34e40
USER 65532:65532
# Actions supplies its own HOME; use a writable temporary home for the scanner.
ENTRYPOINT ["/usr/bin/env", "HOME=/tmp", "/usr/local/bin/checkov"]
