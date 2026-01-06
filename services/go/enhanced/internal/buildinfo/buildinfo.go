package buildinfo

// These values are intended to be injected at build-time using -ldflags.
// See Dockerfile for an example.
var (
	Version = "dev"
	Commit  = "unknown"
	Date    = "unknown"
)
