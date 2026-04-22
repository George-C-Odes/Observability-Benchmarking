package io.github.georgecodes.benchmarking.quarkus.rest;

import io.github.georgecodes.benchmarking.quarkus.application.HelloService;
import io.github.georgecodes.benchmarking.quarkus.application.port.CachePort;
import io.github.georgecodes.benchmarking.quarkus.application.port.HelloMode;
import io.github.georgecodes.benchmarking.quarkus.application.port.MetricsPort;
import io.github.georgecodes.benchmarking.quarkus.application.port.SleepPort;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HelloResourceUnitTest {

    @Test
    void helloReactiveReturnsInterruptedWhenHelloServiceThrowsInterruptedException() {
        HelloResource resource = new HelloResource(new InterruptingHelloService());
        AtomicBoolean interrupted = new AtomicBoolean();

        try {
            String response = resource.helloReactive(0, false)
                .invoke(() -> interrupted.set(Thread.currentThread().isInterrupted()))
                .subscribeAsCompletionStage()
                .join();

            assertEquals("Interrupted", response);
            assertTrue(interrupted.get());
        } finally {
            clearCurrentThreadInterruptFlag();
        }
    }

    @SuppressWarnings("ResultOfMethodCallIgnored")
    private static void clearCurrentThreadInterruptFlag() {
        Thread.interrupted();
    }

    private static final class InterruptingHelloService extends HelloService {
        private InterruptingHelloService() {
            super(new NoOpCachePort(), new NoOpMetricsPort(), new NoOpSleepPort());
        }

        @Override
        public String hello(HelloMode mode, int sleepSeconds) throws InterruptedException {
            throw new InterruptedException("simulated interruption");
        }
    }

    private static final class NoOpCachePort implements CachePort {
        @Override
        public String getIfPresent(String key) {
            return null;
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

    private static final class NoOpSleepPort implements SleepPort {
        @Override
        public void sleep(long amount, io.github.georgecodes.benchmarking.quarkus.application.port.TimeUnit unit) {
            // No-op.
        }
    }
}


