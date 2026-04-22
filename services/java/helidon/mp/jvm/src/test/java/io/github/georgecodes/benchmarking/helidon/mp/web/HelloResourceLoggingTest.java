package io.github.georgecodes.benchmarking.helidon.mp.web;

import io.github.georgecodes.benchmarking.helidon.mp.application.HelloService;
import io.github.georgecodes.benchmarking.helidon.mp.infra.cache.CaffeineCacheAdapter;
import io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter;
import io.github.georgecodes.benchmarking.helidon.mp.infra.time.ThreadSleepAdapter;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class HelloResourceLoggingTest {

    @Test
    void virtualSupportsLoggingFlag() throws InterruptedException {
        HelloService helloService = new HelloService(
                new CaffeineCacheAdapter(4),
                new MicrometerMetricsAdapter(),
                new ThreadSleepAdapter());
        HelloResource resource = new HelloResource(helloService);

        String response = resource.virtual(0, true);

        assertTrue(response.startsWith("Hello from Helidon MP virtual REST "));
    }
}
