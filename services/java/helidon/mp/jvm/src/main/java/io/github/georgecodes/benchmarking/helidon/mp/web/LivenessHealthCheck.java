package io.github.georgecodes.benchmarking.helidon.mp.web;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.Liveness;

/**
 * MicroProfile Health liveness check.
 * Endpoint: /health/live
 */
@Liveness
@ApplicationScoped
public class LivenessHealthCheck implements HealthCheck {

    @Override
    public HealthCheckResponse call() {
        return HealthCheckResponse.named("helidon-mp")
                .up()
                .build();
    }
}