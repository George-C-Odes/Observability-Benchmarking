package io.github.georgecodes.benchmarking.quarkus.application;

import io.github.georgecodes.benchmarking.quarkus.application.port.HelloMode;
import io.github.georgecodes.benchmarking.quarkus.application.port.MetricsPort;
import jakarta.enterprise.context.ApplicationScoped;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;
import java.util.List;

/**
 * Application/use-case responsible for preparing metrics used on the request hot path.
 *
 * <p>This keeps the infrastructure-specific registration work out of the request handling flow and
 * preserves clean architecture boundaries: the application layer only depends on the {@link MetricsPort}.
 */
@ApplicationScoped
@RequiredArgsConstructor
public class HelloMetricsWarmupService {

    /**
     * Metrics gateway used by the application layer to trigger infrastructure metric warmup.
     */
    private final MetricsPort metricsPort;


    /**
     * Pre-register counters for all known hello endpoints.
     */
    public void warmupHelloCounters() {
        List<String> endpointTags = Arrays.stream(HelloMode.values())
            .map(HelloMode::endpointTag)
            .toList();

        metricsPort.preRegisterHelloRequestCounters(endpointTags);
    }
}