SHELL := /bin/sh

.PHONY: test lint run

run:
	go run ./cmd/server

test:
	go test ./... -race

lint:
	golangci-lint run
