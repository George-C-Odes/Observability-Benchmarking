# syntax=docker/dockerfile:1.7-labs@sha256:b99fecfe00268a8b556fad7d9c37ee25d716ae08a5d7320e6d51c4dd83246894
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
FROM gcr.io/distroless/static-debian13:nonroot@sha256:18f4cc26c9ffa7f20a359298be7deadac5c607c8e03a02b8119f1a5fc2f82c99

WORKDIR /
COPY --from=builder /out/app /app
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app"]