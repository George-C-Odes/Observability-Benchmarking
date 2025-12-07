# Services

This directory contains the REST service implementations used for benchmarking.

## Naming & Expectations

- Each service should have its own subdirectory (e.g., `quarkus-reactive/`, `spring-virtual/`)
- Include a Dockerfile in each service directory
- Include a README describing the service, thread model, and any special configuration
- Services should expose a configurable port via `SERVICE_PORT` environment variable

##Useful Docker commands
Native builder image pull from Oracle Enterprise:
  ```bash
docker pull container-registry.oracle.com/graalvm/native-image:25.0.1-ol10
  ```

Native builder image pull from GraalVM community:
  ```bash
docker pull ghcr.io/graalvm/native-image-community:25.0.1-ol10
  ```