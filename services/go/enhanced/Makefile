SHELL := /bin/sh
PYTHON ?= python

.PHONY: build test lint coverage run

build: coverage
	go build ./cmd/server

run:
	go run ./cmd/server

test:
	go test ./... -race

lint:
	golangci-lint run

coverage:
	go test ./... -race -coverprofile=coverage.out -covermode=atomic
	go tool cover -func=coverage.out
	go tool cover -html=coverage.out -o coverage.html

	$(PYTHON) ../../../scripts/coverage_gate.py go-enhanced
