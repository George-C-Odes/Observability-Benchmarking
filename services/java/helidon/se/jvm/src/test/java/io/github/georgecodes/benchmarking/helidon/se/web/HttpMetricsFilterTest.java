package io.github.georgecodes.benchmarking.helidon.se.web;

import io.helidon.http.HttpPrologue;
import io.helidon.http.Method;
import io.helidon.http.RoutedPath;
import io.helidon.http.Status;
import io.helidon.webserver.http.RoutingRequest;
import io.helidon.webserver.http.RoutingResponse;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HttpMetricsFilterTest {
    private SimpleMeterRegistry registry;

    @BeforeEach
    void setUp() {
        Metrics.globalRegistry.getMeters().forEach(Metrics.globalRegistry::remove);
        registry = new SimpleMeterRegistry();
        Metrics.addRegistry(registry);
    }

    @AfterEach
    void tearDown() {
        Metrics.globalRegistry.getMeters().forEach(Metrics.globalRegistry::remove);
        Metrics.removeRegistry(registry);
        registry.close();
    }

    @Test
    void recordsStatusBoundariesAndReusesTimerForRepeatedRequests() {
        HttpMetricsFilter filter = new HttpMetricsFilter();
        int[] proceeded = {0};
        for (int status : new int[]{99, 100, 599, 600}) {
            for (int i = 0; i < 2; i++) {
                filter.filter(() -> proceeded[0]++, request(), response(status));
            }
            assertEquals(2, timer(status).count());
        }
        assertEquals(8, proceeded[0]);
        assertEquals(4, registry.getMeters().size());
    }

    @Test
    void recordsTimerAndPropagatesDownstreamFailure() {
        HttpMetricsFilter filter = new HttpMetricsFilter();
        IllegalStateException failure = new IllegalStateException("handler failed");

        assertSame(failure, assertThrows(IllegalStateException.class,
                () -> filter.filter(() -> { throw failure; }, request(), response(500))));

        assertEquals(1, timer(500).count());
    }

    private Timer timer(int status) {
        return registry.get("http.server.requests")
                .tags("method", "GET", "uri", "/hello/virtual", "status", String.valueOf(status))
                .timer();
    }

    private static RoutingRequest request() {
        HttpPrologue prologue = HttpPrologue.create(
                "HTTP/1.1", "HTTP", "1.1", Method.GET, "/hello/virtual", false);
        RoutedPath path = (RoutedPath) Proxy.newProxyInstance(
                RoutedPath.class.getClassLoader(), new Class<?>[]{RoutedPath.class},
                (_, method, _) -> {
                    if ("path".equals(method.getName())) {
                        return "/hello/virtual";
                    }
                    throw new AssertionError("Unexpected path method: " + method);
                });
        return (RoutingRequest) Proxy.newProxyInstance(
                RoutingRequest.class.getClassLoader(), new Class<?>[]{RoutingRequest.class},
                (_, method, _) -> switch (method.getName()) {
                    case "prologue" -> prologue;
                    case "path" -> path;
                    default -> throw new AssertionError("Unexpected request method: " + method);
                });
    }

    private static RoutingResponse response(int status) {
        return (RoutingResponse) Proxy.newProxyInstance(
                RoutingResponse.class.getClassLoader(), new Class<?>[]{RoutingResponse.class},
                (_, method, _) -> {
                    if ("status".equals(method.getName())) {
                        return Status.create(status);
                    }
                    throw new AssertionError("Unexpected response method: " + method);
                });
    }
}
