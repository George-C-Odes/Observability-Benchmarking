# Build stage
FROM golang:1.25.4-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server ./cmd/server

# Run stage
FROM gcr.io/distroless/base-debian12
COPY --from=builder /app/server /server
EXPOSE 8080
CMD ["/server"]