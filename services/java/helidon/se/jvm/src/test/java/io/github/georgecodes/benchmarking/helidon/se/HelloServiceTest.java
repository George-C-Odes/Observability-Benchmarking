package io.github.georgecodes.benchmarking.helidon.se;

import io.github.georgecodes.benchmarking.helidon.se.application.HelloService;
import io.github.georgecodes.benchmarking.helidon.se.application.port.CachePort;
import io.github.georgecodes.benchmarking.helidon.se.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.se.application.port.MetricsPort;
import io.github.georgecodes.benchmarking.helidon.se.application.port.SleepPort;
import io.github.georgecodes.benchmarking.helidon.se.application.port.TimeUnit;
import io.github.georgecodes.benchmarking.helidon.se.infra.cache.CaffeineCacheAdapter;
import io.github.georgecodes.benchmarking.helidon.se.infra.metrics.MicrometerMetricsAdapter;
import io.github.georgecodes.benchmarking.helidon.se.infra.time.ThreadSleepAdapter;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HelloServiceTest {

    private final CachePort cachePort = new CaffeineCacheAdapter(100);
    private final MetricsPort metricsPort = new MicrometerMetricsAdapter();
    private final SleepPort sleepPort = new ThreadSleepAdapter();
    private final HelloService helloService = new HelloService(cachePort, metricsPort, sleepPort);

    @Test
    void helloReturnsExpectedPrefix() throws InterruptedException {
        String result = helloService.hello(HelloMode.VIRTUAL, 0);
        assertNotNull(result);
        assertTrue(result.startsWith("Hello from Helidon SE virtual REST "),
                "Unexpected result: " + result);
    }

    @Test
    void helloRejectsNegativeSleep() {
        assertThrows(IllegalArgumentException.class,
                () -> helloService.hello(HelloMode.VIRTUAL, -1));
    }

    @Test
    void helloRejectsNullMode() {
        assertThrows(NullPointerException.class,
                () -> helloService.hello(null, 0));
    }

    @Test
    void constructorRejectsNullDependencies() {
        assertThrows(NullPointerException.class, () -> new HelloService(null, metricsPort, sleepPort));
        assertThrows(NullPointerException.class, () -> new HelloService(cachePort, null, sleepPort));
        assertThrows(NullPointerException.class, () -> new HelloService(cachePort, metricsPort, null));
    }

    @Test
    void helloDelegatesPositiveSleepToSleepPort() throws InterruptedException {
        RecordingSleepPort recordingSleepPort = new RecordingSleepPort();
        RecordingMetricsPort recordingMetricsPort = new RecordingMetricsPort();
        HelloService service = new HelloService(key -> "cached-" + key, recordingMetricsPort, recordingSleepPort);

        String result = service.hello(HelloMode.VIRTUAL, 2);

        assertEquals("Hello from Helidon SE virtual REST cached-1", result);
        assertEquals(HelloMode.VIRTUAL.endpointTag(), recordingMetricsPort.endpointTag);
        assertEquals(2, recordingSleepPort.duration);
        assertEquals(TimeUnit.SECONDS, recordingSleepPort.unit);
    }

    private static final class RecordingMetricsPort implements MetricsPort {
        private String endpointTag;

        @Override
        public void incrementHelloRequest(String endpointTag) {
            this.endpointTag = endpointTag;
        }
    }

    private static final class RecordingSleepPort implements SleepPort {
        private long duration;
        private TimeUnit unit;

        @Override
        public void sleep(long duration, TimeUnit unit) {
            this.duration = duration;
            this.unit = unit;
        }
    }
}
