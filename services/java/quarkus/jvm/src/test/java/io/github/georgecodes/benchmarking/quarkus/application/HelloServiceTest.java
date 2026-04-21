package io.github.georgecodes.benchmarking.quarkus.application;

import io.github.georgecodes.benchmarking.quarkus.application.port.CachePort;
import io.github.georgecodes.benchmarking.quarkus.application.port.HelloMode;
import io.github.georgecodes.benchmarking.quarkus.application.port.MetricsPort;
import io.github.georgecodes.benchmarking.quarkus.application.port.SleepPort;
import io.github.georgecodes.benchmarking.quarkus.application.port.TimeUnit;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class HelloServiceTest {

    @Test
    void helloReturnsCachedValueAndIncrementsMetricWithoutSleeping() throws InterruptedException {
        RecordingCachePort cachePort = new RecordingCachePort("value-1");
        RecordingMetricsPort metricsPort = new RecordingMetricsPort();
        RecordingSleepPort sleepPort = new RecordingSleepPort();
        HelloService service = new HelloService(cachePort, metricsPort, sleepPort);

        String response = service.hello(HelloMode.PLATFORM, 0);

        assertEquals("Hello from Quarkus platform REST value-1", response);
        assertEquals("1", cachePort.lastRequestedKey);
        assertEquals(List.of("/hello/platform"), metricsPort.incrementedEndpoints);
        assertEquals(0, sleepPort.calls);
    }

    @Test
    void helloSleepsWhenPositiveDurationIsProvided() throws InterruptedException {
        RecordingCachePort cachePort = new RecordingCachePort("value-99");
        RecordingMetricsPort metricsPort = new RecordingMetricsPort();
        RecordingSleepPort sleepPort = new RecordingSleepPort();
        HelloService service = new HelloService(cachePort, metricsPort, sleepPort);

        String response = service.hello(HelloMode.VIRTUAL, 2);

        assertEquals("Hello from Quarkus virtual REST value-99", response);
        assertEquals(List.of("/hello/virtual"), metricsPort.incrementedEndpoints);
        assertEquals(1, sleepPort.calls);
        assertEquals(2L, sleepPort.lastAmount);
        assertEquals(TimeUnit.SECONDS, sleepPort.lastUnit);
    }

    @Test
    void helloRejectsNullMode() {
        HelloService service = new HelloService(
            new RecordingCachePort("value-1"),
            new RecordingMetricsPort(),
            new RecordingSleepPort()
        );

        assertThrows(NullPointerException.class, () -> service.hello(null, 0));
    }

    @Test
    void helloRejectsNegativeSleepDurationBeforeTriggeringSideEffects() {
        RecordingCachePort cachePort = new RecordingCachePort("value-1");
        RecordingMetricsPort metricsPort = new RecordingMetricsPort();
        RecordingSleepPort sleepPort = new RecordingSleepPort();
        HelloService service = new HelloService(cachePort, metricsPort, sleepPort);

        assertThrows(IllegalArgumentException.class, () -> service.hello(HelloMode.REACTIVE, -1));
        assertEquals(List.of(), metricsPort.incrementedEndpoints);
        assertEquals(0, sleepPort.calls);
        assertNull(cachePort.lastRequestedKey);
    }

    private static final class RecordingCachePort implements CachePort {
        private final String value;
        private String lastRequestedKey;

        private RecordingCachePort(String value) {
            this.value = value;
        }

        @Override
        public String getIfPresent(String key) {
            lastRequestedKey = key;
            return value;
        }
    }

    private static final class RecordingMetricsPort implements MetricsPort {
        private final List<String> incrementedEndpoints = new ArrayList<>();

        @Override
        public void incrementHelloRequest(String endpointTag) {
            incrementedEndpoints.add(endpointTag);
        }

        @Override
        public void preRegisterHelloRequestCounters(java.util.Collection<String> endpointTags) {
            // Not needed in these tests.
        }
    }

    private static final class RecordingSleepPort implements SleepPort {
        private int calls;
        private long lastAmount;
        private TimeUnit lastUnit;

        @Override
        public void sleep(long amount, TimeUnit unit) {
            calls++;
            lastAmount = amount;
            lastUnit = unit;
        }
    }
}

