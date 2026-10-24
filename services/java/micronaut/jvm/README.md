# Micronaut JVM service

This module runs the shared Micronaut application on the JVM. It contains the Java sources, application configuration, native-image metadata, and tests reused by the native module.

See the [shared Micronaut guide](../README.md) for the current framework version, endpoint and thread contracts, ports, build/run commands, configuration, and telemetry.

## JVM packaging

The [Dockerfile](Dockerfile) builds a shaded JAR, creates a jlink JRE, and packages both in a non-root distroless image. The [POM](pom.xml) defines framework and integration dependencies, annotation processors, tests, and JVM build plugins.

## Experimental Loom carrier

Compose maps `MICRONAUT_LOOM_CARRIER` from the env file to Netty's `MICRONAUT_NETTY_EVENT_LOOPS_DEFAULT_LOOM_CARRIER` setting. Its Micronaut-specific JVM options include the `java.lang` module opening used by the experiment.

The `/hello/virtual-event-loop` route stays on the event loop; its name does not independently enable a virtual carrier. That route is excluded from headline benchmarks. Record the carrier setting when comparing the ordinary virtual and reactive routes, since they share this application configuration.

## Where to make changes

Edit shared endpoints, adapters, configuration, and tests under [src](src). Changes also affect the [native variant](../native/README.md). Keep native reflection metadata with the shared resources and validate native-image compatibility when adding dependencies or changing initialization.

For local development, run `mvn mn:run` from this directory. Run `mvn verify -B` for tests and configured checks; the shared guide covers container execution and endpoint checks.
