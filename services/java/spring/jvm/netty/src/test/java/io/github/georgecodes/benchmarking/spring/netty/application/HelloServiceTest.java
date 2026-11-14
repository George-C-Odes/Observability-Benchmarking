package io.github.georgecodes.benchmarking.spring.netty.application;

import io.github.georgecodes.benchmarking.spring.netty.application.port.CachePort;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HelloServiceTest {

    @Test
    void interruptedSleepPreservesInterruptAndStillReturnsResponse() {
        CachePort cache = mock(CachePort.class);
        when(cache.get("1")).thenReturn("value-1");
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        try {
            Counter counter = registry.counter("hello.request.count");
            HelloService service = new HelloService(cache, counter);

            // A pending interrupt makes Thread.sleep fail immediately, without timing races.
            Thread.currentThread().interrupt();
            try {
                String response = service.reactiveHello(1, false);

                assertThat(Thread.currentThread().isInterrupted()).isTrue();
                assertThat(response).isEqualTo("Hello from Boot reactive REST value-1");
                assertThat(counter.count()).isEqualTo(1);
            } finally {
                // Do not leak interrupt state into the test runner or other tests.
                Thread.interrupted();
            }
        } finally {
            registry.close();
        }
    }
}
