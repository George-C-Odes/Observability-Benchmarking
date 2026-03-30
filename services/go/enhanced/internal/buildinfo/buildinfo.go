// Package buildinfo exposes build-time metadata injected via -ldflags.
package buildinfo

// Version is intended to be injected at build-time using -ldflags.
// See Dockerfile for an example.
var Version = "dev"
