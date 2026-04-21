package io.github.georgecodes.benchmarking.micronaut.web;

import io.github.georgecodes.benchmarking.micronaut.application.HelloService;
import io.github.georgecodes.benchmarking.micronaut.application.port.HelloMode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HelloControllerUnitTest {

    @Test
    void platformWithLoggingDelegatesToPlatformMode() {
        RecordingHelloService helloService = new RecordingHelloService("platform-response");
        HelloController controller = new HelloController(helloService);

        String result = controller.platform(0, true);

        assertEquals("platform-response", result);
        assertEquals(HelloMode.PLATFORM, helloService.lastMode);
        assertEquals(0, helloService.lastSleepSeconds);
    }

    @Test
    void virtualWithLoggingDelegatesToVirtualMode() {
        RecordingHelloService helloService = new RecordingHelloService("virtual-response");
        HelloController controller = new HelloController(helloService);

        String result = controller.virtual(1, true);

        assertEquals("virtual-response", result);
        assertEquals(HelloMode.VIRTUAL, helloService.lastMode);
        assertEquals(1, helloService.lastSleepSeconds);
    }

    @Test
    void virtualEventLoopWithLoggingDelegatesToVirtualCarrierMode() {
        RecordingHelloService helloService = new RecordingHelloService("virtual-event-loop-response");
        HelloController controller = new HelloController(helloService);

        String result = controller.virtualEventLoop(2, true);

        assertEquals("virtual-event-loop-response", result);
        assertEquals(HelloMode.VIRTUAL_CARRIER, helloService.lastMode);
        assertEquals(2, helloService.lastSleepSeconds);
    }

    @Test
    void reactiveWithLoggingDelegatesToReactiveMode() {
        RecordingHelloService helloService = new RecordingHelloService("reactive-response");
        HelloController controller = new HelloController(helloService);

        String result = controller.reactive(3, true).block();

        assertEquals("reactive-response", result);
        assertEquals(HelloMode.REACTIVE, helloService.lastMode);
        assertEquals(3, helloService.lastSleepSeconds);
    }

    private static final class RecordingHelloService extends HelloService {
        private final String response;
        private HelloMode lastMode;
        private int lastSleepSeconds;

        private RecordingHelloService(String response) {
            super(HelloControllerUnitTest::unusedCacheValue, HelloControllerUnitTest::ignoreMetric,
                HelloControllerUnitTest::ignoreSleep);
            this.response = response;
        }

        @Override
        public String hello(HelloMode mode, int sleepSeconds) {
            lastMode = mode;
            lastSleepSeconds = sleepSeconds;
            return response;
        }
    }

    private static String unusedCacheValue(String key) {
        return "unused";
    }

    private static void ignoreMetric(String endpointTag) {
    }

    private static void ignoreSleep(long duration, io.github.georgecodes.benchmarking.micronaut.application.port.TimeUnit unit) {
    }
}

