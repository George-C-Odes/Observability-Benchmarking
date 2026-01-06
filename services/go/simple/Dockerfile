# Build stage
ARG GO_VERSION=1.25.5
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG BASE_BUILDER=alpine

FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-${BASE_BUILDER} AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server ./cmd/server

# Run stage
FROM gcr.io/distroless/static-debian13:nonroot

COPY --from=builder /app/server /server
EXPOSE 8080
USER nonroot:nonroot
CMD ["/server"]