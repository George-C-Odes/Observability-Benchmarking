# syntax=docker/dockerfile:1.28-labs@sha256:ad43eec41369d9ef94412c0d1eb3203d12218d01da225afc92a3aeba3a0e7796
ARG GO_VERSION=1.27.3
ARG BASE_BUILDER=alpine3.24

# ------------ BUILD STAGE -----------------------
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-${BASE_BUILDER} AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

# Cache dependencies
COPY --link go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
  go mod download

# Copy source
COPY --link . .

# Build: pure Go static-ish binary, optimized for containers
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -buildvcs=false \
      -ldflags="-s -w" \
      -o /out/app ./cmd/server

# ------------ RUNTIME STAGE ----------------------
FROM gcr.io/distroless/static-debian13:nonroot@sha256:25ac8f0c3b2334a9eb05452266bd4697864a8c8ef0ef71e5e6480d7f92868329

WORKDIR /
COPY --from=builder /out/app /app
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app"]