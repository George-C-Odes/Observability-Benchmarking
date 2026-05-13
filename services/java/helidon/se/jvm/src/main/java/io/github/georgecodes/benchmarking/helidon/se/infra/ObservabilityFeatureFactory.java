package io.github.georgecodes.benchmarking.helidon.se.infra;

import io.helidon.config.Config;
import io.helidon.health.HealthCheckResponse;
import io.helidon.service.registry.Services;
import io.helidon.tracing.Tracer;
import io.helidon.webserver.observe.ObserveFeature;
import io.helidon.webserver.observe.health.HealthObserver;
import io.helidon.webserver.observe.tracing.TracingObserver;

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
        return ObserveFeature.just(HealthObserver.builder()
                .addCheck(() -> HealthCheckResponse.builder()
                        .status(true)
                        .detail("service", serviceName)
                        .build())
                .build());
    }

    /**
     * Creates an {@link ObserveFeature} with a liveness health check and an explicitly configured
     * tracing observer.
     * <p>
     * Helidon SE's tracing observer defaults the server span name to {@code HTTP Request}. We
     * override that via {@code tracing.*} application configuration so Tempo shows route-based span
     * names such as {@code GET /hello/virtual}.
     *
     * @param serviceName human-readable service name included in the health detail
     * @param config application configuration root
     * @return configured observe feature
     */
    public static ObserveFeature create(String serviceName, Config config) {
        return ObserveFeature.builder()
                .addObserver(TracingObserver.create(Services.get(Tracer.class), config.get("tracing")))
                .addObserver(HealthObserver.builder()
                        .addCheck(() -> HealthCheckResponse.builder()
                                .status(true)
                                .detail("service", serviceName)
                                .build())
                        .build())
                .build();
    }
}