package io.github.georgecodes.benchmarking.helidon.se.application.port;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HelloModeAndTimeUnitTest {

    @Test
    void helloModeExposesStableBenchmarkMetadata() {
        assertEquals("virtual", HelloMode.VIRTUAL.label());
        assertEquals("/hello/virtual", HelloMode.VIRTUAL.endpointTag());
        assertEquals("Hello from Helidon SE virtual REST ", HelloMode.VIRTUAL.responsePrefix());
    }

    @Test
    void timeUnitConvertsToMilliseconds() {
        assertEquals(7L, TimeUnit.MILLISECONDS.toMillis(7L));
        assertEquals(3_000L, TimeUnit.SECONDS.toMillis(3L));
    }
}
