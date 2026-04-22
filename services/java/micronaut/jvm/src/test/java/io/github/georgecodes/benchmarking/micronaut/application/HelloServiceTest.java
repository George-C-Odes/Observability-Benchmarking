package io.github.georgecodes.benchmarking.micronaut.application;

import io.github.georgecodes.benchmarking.micronaut.application.port.HelloMode;
import io.github.georgecodes.benchmarking.micronaut.application.port.MetricsPort;
import io.github.georgecodes.benchmarking.micronaut.application.port.SleepPort;
import io.github.georgecodes.benchmarking.micronaut.application.port.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HelloServiceTest {

    @AfterEach
    void clearInterruptStatus() {
        if (Thread.currentThread().isInterrupted()) {
            assertTrue(Thread.interrupted());
        }
    }

    @Test
    void helloReturnsCachedValueAndRecordsMetricsWithoutSleeping() {
        RecordingMetricsPort metricsPort = new RecordingMetricsPort();
        RecordingSleepPort sleepPort = new RecordingSleepPort();
        HelloService helloService = new HelloService(HelloServiceTest::cachedValue, metricsPort, sleepPort);

        String result = helloService.hello(HelloMode.PLATFORM, 0);

        assertEquals("Hello from Micronaut platform REST value-1", result);
        assertEquals("/hello/platform", metricsPort.lastEndpointTag);
        assertFalse(sleepPort.wasCalled);
    }

    @Test
    void helloSleepsInSecondsWhenRequested() {
        RecordingMetricsPort metricsPort = new RecordingMetricsPort();
        RecordingSleepPort sleepPort = new RecordingSleepPort();
        HelloService helloService = new HelloService(HelloServiceTest::cachedValue, metricsPort, sleepPort);

        String result = helloService.hello(HelloMode.VIRTUAL, 2);

        assertEquals("Hello from Micronaut virtual REST value-1", result);
        assertEquals("/hello/virtual", metricsPort.lastEndpointTag);
        assertTrue(sleepPort.wasCalled);
        assertEquals(2L, sleepPort.lastDuration);
        assertEquals(TimeUnit.SECONDS, sleepPort.lastUnit);
    }

    @Test
    void helloRestoresInterruptFlagWhenSleepIsInterrupted() {
        RecordingMetricsPort metricsPort = new RecordingMetricsPort();
        HelloService helloService = new HelloService(HelloServiceTest::cachedValue, metricsPort,
            HelloServiceTest::interruptSleep);

        String result = helloService.hello(HelloMode.REACTIVE, 1);

        assertEquals("Hello from Micronaut reactive REST value-1", result);
        assertEquals("/hello/reactive", metricsPort.lastEndpointTag);
        assertTrue(Thread.currentThread().isInterrupted());
    }

    private static final class RecordingMetricsPort implements MetricsPort {
        private String lastEndpointTag;

        @Override
        public void incrementHelloRequest(String endpointTag) {
            this.lastEndpointTag = endpointTag;
        }
    }

    private static final class RecordingSleepPort implements SleepPort {
        private boolean wasCalled;
        private long lastDuration;
        private TimeUnit lastUnit;

        @Override
        public void sleep(long duration, TimeUnit unit) {
            wasCalled = true;
            lastDuration = duration;
            lastUnit = unit;
        }
    }

    private static String cachedValue(String key) {
        return "value-1";
    }

    private static void interruptSleep(long duration, TimeUnit unit) throws InterruptedException {
        throw new InterruptedException("expected in test");
    }
}

