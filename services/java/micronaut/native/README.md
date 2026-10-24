# Micronaut native service

This module compiles the [JVM module's sources](../jvm/src) with GraalVM `native-image`. Its [POM](pom.xml) reuses JVM Java sources, resources, and test sources through `build-helper-maven-plugin`; it has no separate application implementation.

See the [shared Micronaut guide](../README.md) for the current framework version, endpoint contract, ports, build/run commands, configuration, and telemetry.

## Native packaging and configuration

The [Dockerfile](Dockerfile) uses the Maven Wrapper in the Oracle GraalVM builder, copies the shared source tree into its workspace, shades the application JAR, and compiles it with the `-Dnative` Maven profile. The final non-root distroless C/C++ runtime image contains the executable rather than a JVM.

The runtime image copies `application.yml` to `/native/application.yml` and sets `MICRONAUT_CONFIG_FILES` to that path. Its entrypoint is `./micronaut-native`. Compose supplies native runtime arguments; the POM also defines defaults baked into the binary.

Compose forces `MICRONAUT_NETTY_EVENT_LOOPS_DEFAULT_LOOM_CARRIER=false` for this variant. The experimental event-loop route remains available, but it does not use the JVM's Loom-carrier setup. The regular virtual-thread executor is configured separately.

## Native-image settings

The native POM owns the complete flag list, including:

- Throughput optimization with `-O2` and `-march=native`, G1 GC, and `--no-fallback`. The binary targets the build CPU.
- Frame/debug metadata plus heap-dump and JFR monitoring support.
- `-H:+SharedArenaSupport` for Netty shared-arena direct buffers and native access support.
- Runtime initialization for Netty, Reactor Netty, and the OTel Logback instrumentation.
- Application/Logback resource inclusion and service-provider metadata merged by the shade plugin.

These flags are tied to the configured GraalVM builder. Validate compiler support when changing its image or toolchain.

## Build and startup troubleshooting

| Symptom or constraint                                 | Configuration to inspect                                                                                                                                                     |
|-------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Native compiler runs out of memory                    | Dockerfile `NATIVE_IMAGE_MAX_HEAP` build argument and memory available to the builder                                                                                        |
| Missing classes or reflective access failures         | Shared [reflect-config.json](../jvm/src/main/resources/META-INF/native-image/io.github.georgecodes/micronaut-native/reflect-config.json) and generated reachability metadata |
| Netty or OTel initialization fails during compilation | Native POM's `--initialize-at-run-time` directives and shared-arena settings                                                                                                 |
| Configuration is not found at startup                 | Copied `application.yml`, `MICRONAUT_CONFIG_FILES`, and included resources                                                                                                   |
| Exporter or service-provider discovery fails          | Shade plugin's `ServicesResourceTransformer`, dependency metadata, and Compose `OTEL_*` settings                                                                             |

Telemetry uses the embedded SDK. JVM agent options do not apply to this executable; profiling relies on the configured native monitoring support and external collection.

Edit shared application behavior in the [JVM module](../jvm/README.md). Edit native compilation and packaging here. Run a native build after changing flags, reflection metadata, or dependencies; passing shared JVM tests alone does not validate native-image analysis.
