package io.github.georgecodes.benchmarking.quarkus.infra.bootstrap;

import io.github.georgecodes.benchmarking.quarkus.application.HelloMetricsWarmupService;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import lombok.RequiredArgsConstructor;

/**
 * Quarkus bootstrap hook that triggers warmup work during application startup.
 *
 * <p>Lives in the infra layer: it depends on Quarkus runtime events and calls into an
 * application-layer use-case ({@link HelloMetricsWarmupService}).
 */
@ApplicationScoped
@RequiredArgsConstructor
public class MetricsWarmupStartupObserver {

    /**
     * Application-layer use case invoked at startup to pre-register metrics.
     */
    private final HelloMetricsWarmupService warmupService;

    void onStart(@Observes StartupEvent event) {
        // Pre-register counters so request handling doesn't do meter registration.
        warmupService.warmupHelloCounters();
    }
}