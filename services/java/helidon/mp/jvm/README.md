# Helidon MP JVM service

This module runs the MicroProfile implementation on the JVM, using Weld CDI, JAX-RS, MicroProfile Config, and MicroProfile Health.

See the [shared Helidon guide](../../README.md) for the current framework version, endpoint contract, ports, build/run commands, telemetry, and resource configuration.

## Implementation

- `HelloResource` implements the virtual-thread endpoint; `LivenessHealthCheck` provides liveness.
- `HelloService` and the cache, metrics, and sleep adapters are CDI-managed beans.
- `StartupListener` warms up meters; `JulBridgeStartupListener` bridges JUL to SLF4J.
- `helidon-microprofile-telemetry` initializes the OTel SDK and request tracing. Application code supplies benchmark meters and Logback integration.

## JVM packaging

The [Dockerfile](Dockerfile) builds a shaded JAR, creates a jlink JRE, and packages both in a non-root distroless image. The [POM](pom.xml) defines dependencies and JVM build plugins.

The [native variant](../native/README.md) reuses these sources and adds Weld/GraalVM bootstrap support. Shared application changes belong in this module's [sources](src/main).
