package io.github.georgecodes.benchmarking.helidon.mp.web;

import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class HttpMetricsFilterTest {

    @BeforeEach
    @AfterEach
    void clearMeters() {
        Metrics.globalRegistry.getMeters().forEach(Metrics.globalRegistry::remove);
    }

    @Test
    void requestFilterSkipsSampleWhenDisabled() {
        HttpMetricsFilter filter = new HttpMetricsFilter(false);
        RequestContextHandler handler = new RequestContextHandler("GET");

        filter.filter(handler.proxy());

        assertNull(handler.sampleProperty());
    }

    @Test
    void responseFilterIgnoresRequestsWithoutRecordedSample() {
        HttpMetricsFilter filter = new HttpMetricsFilter(true);
        RequestContextHandler handler = new RequestContextHandler("GET");

        filter.filter(handler.proxy(), responseContext(200));

        Timer timer = Metrics.globalRegistry.find("http.server.requests")
                .tag("method", "GET")
                .tag("uri", "/hello/virtual")
                .tag("status", "200")
                .timer();
        assertNull(timer);
    }

    @Test
    void responseFilterRecordsTimersForCommonAndUncommonStatusCodes() {
        HttpMetricsFilter filter = new HttpMetricsFilter(true);

        RequestContextHandler okRequest = new RequestContextHandler("GET");
        filter.filter(okRequest.proxy());
        filter.filter(okRequest.proxy(), responseContext(200));

        RequestContextHandler uncommonRequest = new RequestContextHandler("GET");
        filter.filter(uncommonRequest.proxy());
        filter.filter(uncommonRequest.proxy(), responseContext(777));

        Timer okTimer = Metrics.globalRegistry.find("http.server.requests")
                .tag("method", "GET")
                .tag("uri", "/hello/virtual")
                .tag("status", "200")
                .timer();
        Timer uncommonTimer = Metrics.globalRegistry.find("http.server.requests")
                .tag("method", "GET")
                .tag("uri", "/hello/virtual")
                .tag("status", "777")
                .timer();

        assertNotNull(okTimer);
        assertNotNull(uncommonTimer);
    }

    private static ContainerResponseContext responseContext(int status) {
        return (ContainerResponseContext) Proxy.newProxyInstance(
                ContainerResponseContext.class.getClassLoader(),
                new Class<?>[]{ContainerResponseContext.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "getStatus" -> status;
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == args[0];
                    case "toString" -> "ContainerResponseContext[status=" + status + ']';
                    default -> null;
                });
    }

    private static final class RequestContextHandler implements java.lang.reflect.InvocationHandler {
        private final Map<String, Object> properties = new HashMap<>();
        private final String method;

        private RequestContextHandler(String method) {
            this.method = method;
        }

        private ContainerRequestContext proxy() {
            return (ContainerRequestContext) Proxy.newProxyInstance(
                    ContainerRequestContext.class.getClassLoader(),
                    new Class<?>[]{ContainerRequestContext.class},
                    this);
        }

        private Object sampleProperty() {
            return properties.get("http.metrics.sample");
        }

        @Override
        public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args) {
            return switch (method.getName()) {
                case "setProperty" -> {
                    properties.put((String) args[0], args[1]);
                    yield null;
                }
                case "getProperty" -> properties.get((String) args[0]);
                case "getMethod" -> this.method;
                case "hashCode" -> System.identityHashCode(proxy);
                case "equals" -> proxy == args[0];
                case "toString" -> "ContainerRequestContext[method=" + this.method + ']';
                default -> null;
            };
        }
    }
}
