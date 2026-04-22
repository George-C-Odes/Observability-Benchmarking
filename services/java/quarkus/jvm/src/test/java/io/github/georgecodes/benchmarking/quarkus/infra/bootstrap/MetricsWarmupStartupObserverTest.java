package io.github.georgecodes.benchmarking.quarkus.infra.bootstrap;

import io.github.georgecodes.benchmarking.quarkus.application.HelloMetricsWarmupService;
import io.github.georgecodes.benchmarking.quarkus.application.port.MetricsPort;
import org.junit.jupiter.api.Test;

import java.util.Collection;

import static org.junit.jupiter.api.Assertions.assertTrue;

class MetricsWarmupStartupObserverTest {

    @Test
    void onStartTriggersMetricsWarmup() {
        RecordingHelloMetricsWarmupService warmupService = new RecordingHelloMetricsWarmupService();
        MetricsWarmupStartupObserver observer = new MetricsWarmupStartupObserver(warmupService);

        observer.onStart(null);

        assertTrue(warmupService.called);
    }

    private static final class RecordingHelloMetricsWarmupService extends HelloMetricsWarmupService {
        private boolean called;

        private RecordingHelloMetricsWarmupService() {
            super(new NoOpMetricsPort());
        }

        @Override
        public void warmupHelloCounters() {
            called = true;
        }
    }

    private static final class NoOpMetricsPort implements MetricsPort {
        @Override
        public void incrementHelloRequest(String endpointTag) {
            // No-op.
        }

        @Override
        public void preRegisterHelloRequestCounters(Collection<String> endpointTags) {
            // No-op.
        }
    }
}

