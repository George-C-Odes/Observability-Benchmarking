package io.github.georgecodes.benchmarking.micronaut.jvm.infra.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.micronaut.context.annotation.Context;
import jakarta.inject.Singleton;

/**
 * Bridges Micronaut's {@link MeterRegistry} into Micrometer's global registry.
 *
 * <p>The OpenTelemetry Java agent's Micrometer instrumentation commonly reads from
 * {@link Metrics#globalRegistry}. Micronaut applications, however, create and inject their own
 * registry instance. We therefore add the Micronaut registry to the global composite.
 */
@Singleton
@Context
public final class GlobalMeterRegistryBridgeConfiguration {

    public GlobalMeterRegistryBridgeConfiguration(MeterRegistry meterRegistry) {
        // Micrometer's globalRegistry is a CompositeMeterRegistry; adding the Micronaut registry
        // makes meters created against Metrics.globalRegistry visible to the same backend Micronaut
        // exports to (and to the OTel agent when it reads Metrics.globalRegistry).
        Metrics.globalRegistry.add(meterRegistry);
    }
}