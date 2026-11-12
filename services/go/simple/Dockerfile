# syntax=docker/dockerfile:1.29-labs@sha256:36366b12c1dffb228bb25e9feffb73707b93388f084f4927d2b7686dba29e76a
ARG GO_VERSION=1.27.4
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
FROM gcr.io/distroless/static-debian13:nonroot@sha256:aafe993665bf6200db38a02c11a9351e782a84b6a45e7f33b6695638c88e3931

WORKDIR /
COPY --from=builder /out/app /app
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app"]