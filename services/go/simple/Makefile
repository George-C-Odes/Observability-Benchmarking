SHELL := /bin/sh

.PHONY: test lint coverage run

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

