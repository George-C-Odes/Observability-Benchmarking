package io.github.georgecodes.benchmarking.helidon.se;

import io.github.georgecodes.benchmarking.helidon.se.application.HelloService;
import io.github.georgecodes.benchmarking.helidon.se.application.port.CachePort;
import io.github.georgecodes.benchmarking.helidon.se.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.se.application.port.MetricsPort;
import io.github.georgecodes.benchmarking.helidon.se.application.port.SleepPort;
import io.github.georgecodes.benchmarking.helidon.se.infra.cache.CaffeineCacheAdapter;
import io.github.georgecodes.benchmarking.helidon.se.infra.metrics.MicrometerMetricsAdapter;
import io.github.georgecodes.benchmarking.helidon.se.infra.time.ThreadSleepAdapter;
import org.junit.jupiter.api.Test;

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
}
