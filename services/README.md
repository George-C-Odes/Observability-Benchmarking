# Services

This directory contains the REST service implementations used for benchmarking.

## Naming & Expectations

- Each service should have its own subdirectory (e.g., `quarkus-reactive/`, `spring-virtual/`)
- Include a Dockerfile in each service directory
- Include a README describing the service, thread model, and any special configuration
- Services should expose a configurable port via `SERVICE_PORT` environment variable
