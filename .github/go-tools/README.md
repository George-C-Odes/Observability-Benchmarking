# Go CI tools

This separate module locks `govulncheck` and its build dependencies without adding
scanner dependencies to either benchmark service. Dependabot maintains its
`go.mod` and `go.sum`; both Go quality jobs include the checksum lock in their
cache keys.

The Go language version follows `GO_VERSION` in `compose/.env`. Run
`node scripts/sync-go-mod-versions.mjs` (or IntelliJ **[doc] Render Updates**)
after changing it; this updates all three modules without changing dependency
versions or checksums. Use `--check` to detect version drift without writing.

From the repository root, update the scanner and regenerate its dependency lock:

```sh
go -C .github/go-tools get -tool golang.org/x/vuln/cmd/govulncheck@<version>
go -C .github/go-tools mod tidy
```

Validate and build using the same readonly module mode as CI:

```sh
go -C .github/go-tools mod tidy -diff
go -C .github/go-tools mod verify
go -C .github/go-tools build -mod=readonly -o /tmp/govulncheck golang.org/x/vuln/cmd/govulncheck
```

Run the resulting binary from the service module being scanned. Scanner versions
and build dependencies are locked; the vulnerability database remains current.
The workflows retain their existing advisory `continue-on-error` behavior.
