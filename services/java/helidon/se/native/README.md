# Helidon SE native service

This module compiles the [SE JVM sources](../jvm/src/main) with GraalVM `native-image`. Its `build-helper-maven-plugin` configuration reuses the JVM Java sources and resources; it has no separate application source tree.

See the [shared Helidon guide](../../README.md) for the current framework version, endpoint contract, ports, build/run commands, telemetry, resource configuration, and common native-image settings.

## Native packaging

The [Dockerfile](Dockerfile) uses the Maven Wrapper in the GraalVM builder and copies the resulting binary into a non-root distroless C/C++ runtime image. The final image contains no JVM.

The [native POM](pom.xml) owns native-image flags, resource inclusion, and build-time/runtime initialization settings. Reflection metadata lives in the JVM module's [shared native-image resources](../jvm/src/main/resources/META-INF/native-image).

The shared `OtelConfig` keeps gRPC sender selection consistent with the JVM implementation. OTel Logback initialization is deferred to runtime by the native-image configuration.

## Where to make changes

Edit endpoint behavior, adapters, and application resources in the [JVM module](../jvm/README.md). Edit native compilation settings here. Validate native configuration changes with a native build; the JVM tests do not exercise native-image reachability analysis.
