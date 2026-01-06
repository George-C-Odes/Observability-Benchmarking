# syntax=docker/dockerfile:1.7-labs
# Multi-stage build with BuildKit cache mounts for fast, reproducible builds.

ARG GO_VERSION=1.25.5
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG BASE_BUILDER=alpine

FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-${BASE_BUILDER} AS builder

WORKDIR /src

# Security + reproducible builds (alpine)
#RUN apk add --no-cache ca-certificates git

# Cache deps
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source
COPY . .

# Build: pure Go static-ish binary, optimized for containers
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -buildvcs=false \
      -ldflags="-s -w" \
      -o /out/app ./cmd/server

FROM gcr.io/distroless/static-debian13:nonroot

WORKDIR /
COPY --from=builder /out/app /app
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app"]