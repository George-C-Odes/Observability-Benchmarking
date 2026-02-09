# syntax=docker/dockerfile:1.7-labs
ARG GO_VERSION=1.25.7
ARG BASE_BUILDER=alpine3.23

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
FROM gcr.io/distroless/static-debian13:nonroot

WORKDIR /
COPY --from=builder /out/app /app
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app"]