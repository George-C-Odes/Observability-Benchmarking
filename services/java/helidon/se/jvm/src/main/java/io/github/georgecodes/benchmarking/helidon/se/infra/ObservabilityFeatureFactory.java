package io.github.georgecodes.benchmarking.helidon.se.infra;

import io.helidon.health.HealthCheckResponse;
import io.helidon.webserver.observe.ObserveFeature;
import io.helidon.webserver.observe.health.HealthObserver;

/**
 * Factory for the Helidon {@link ObserveFeature} that bundles health checks.
 * <p>
 * Extracted from the application entry point to keep the composition root
 * focused on wiring (SRP).
 */
public final class ObservabilityFeatureFactory {

    private ObservabilityFeatureFactory() {
    }

    /**
     * Creates an {@link ObserveFeature} with a liveness health check.
     *
     * @param serviceName human-readable service name included in the health detail
     * @return configured observe feature
     */
    public static ObserveFeature create(String serviceName) {
        return ObserveFeature.builder()
                .addObserver(HealthObserver.builder()
                        .addCheck(() -> HealthCheckResponse.builder()
                                .status(true)
                                .detail("service", serviceName)
                                .build())
                        .build())
                .build();
    }
}