# Helidon MP native service

This module compiles the [MP JVM sources](../jvm/src/main) with GraalVM `native-image`, adding native bootstrap code and Weld integration.

See the [shared Helidon guide](../../README.md) for the current framework version, endpoint contract, ports, build/run commands, telemetry, resource configuration, and common native-image settings.

## Native source overlay

The [POM](pom.xml) reuses JVM Java sources and resources through `build-helper-maven-plugin`. Native-specific code lives under [src/main](src/main):

- `Bootstrap` sets Weld startup properties, promotes `OTEL_*` environment variables to `otel.*` system properties, handles `-D` arguments, and invokes Helidon's MicroProfile entrypoint reflectively.
- `WeldProxyBuildTimeInitFeature` discovers and registers Weld proxy classes for build-time initialization.
- `WeldExecutorSubstitution` and `WeldEventPreloaderSubstitution` adapt Weld threading and event preloading for native-image.
- The native Logback configuration omits the OTel appender during build-time initialization. `StartupListener.installOtelLogbackAppender()` attaches it at runtime.

## Build and startup troubleshooting

Weld participates in native-image analysis, so MP needs additional initialization and threading controls beyond SE:

| Symptom or constraint                          | Implementation to inspect                                                                                 |
|------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| Analysis stalls or Weld executor deadlocks     | Native POM's single-thread analysis settings, Weld thread-pool properties, and `WeldExecutorSubstitution` |
| Proxy classes need build-time initialization   | `WeldProxyBuildTimeInitFeature` and its registration in the native POM                                    |
| Event-preloader initialization errors          | `WeldEventPreloaderSubstitution` and the properties set by `Bootstrap`                                    |
| Singleton-provider errors during CDI startup   | Weld singleton-provider properties initialized by `Bootstrap` before invoking Helidon                     |
| Missing telemetry or wrong OTLP transport      | Env-to-system-property promotion in `Bootstrap` and the Compose `OTEL_*` settings                         |
| OTel Logback appender initialization conflicts | Native `logback.xml`, runtime appender installation, and the POM's `--initialize-at-run-time` directives  |

Keep the POM's build-time/runtime initialization lists with the code they support. For native analysis failures, compare the JVM build and inspect the native build log before changing shared application behavior.

## Packaging and runtime

The [Dockerfile](Dockerfile) uses the Maven Wrapper in the GraalVM builder and packages the binary in a non-root distroless C/C++ runtime image. The entrypoint is `./helidon-mp-native`; `Bootstrap` supplies Weld defaults internally. Compose provides native runtime arguments and telemetry settings.

Edit shared endpoint and adapter behavior in the [JVM module](../jvm/README.md). Edit bootstrap, GraalVM substitutions, native resources, and native-image flags here. Changes to these native-specific paths require a native build to validate.
