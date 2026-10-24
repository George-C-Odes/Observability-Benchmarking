# Helidon SE JVM service

This module runs the SE implementation on the JVM, using functional WebServer routing and explicit adapter construction in `HelidonApplication`.

See the [shared Helidon guide](../../README.md) for the current framework version, endpoint contract, ports, build/run commands, telemetry, and resource configuration.

## Implementation

- `HelloRouting` registers routes from `HelloMode.values()` and delegates to `HelloService`.
- `ObservabilityFeatureFactory` assembles health and observe features.
- `OtelConfig` initializes the SDK, selects the OkHttp gRPC sender when needed, and logs discovered sender providers.
- The application layer uses cache, metrics, and sleep ports; the composition root supplies their adapters.

## JVM packaging

The [Dockerfile](Dockerfile) builds a shaded JAR, creates a jlink JRE, and packages both in a non-root distroless image. The [POM](pom.xml) defines dependencies and JVM build plugins.

The [native variant](../native/README.md) reuses these Java sources and resources without a separate application implementation. Shared changes belong in this module's [sources](src/main).
