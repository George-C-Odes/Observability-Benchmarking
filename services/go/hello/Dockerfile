# Build stage
ARG GO_VERSION=1.25.5
FROM golang:${GO_VERSION}-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server ./cmd/server

# Run stage
FROM gcr.io/distroless/base-debian13
COPY --from=builder /app/server /server
EXPOSE 8080
CMD ["/server"]