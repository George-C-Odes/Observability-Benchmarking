package io.github.georgecodes.benchmarking.vertx.web;

import io.github.georgecodes.benchmarking.vertx.domain.HelloService;
import io.github.georgecodes.benchmarking.vertx.infra.CacheProvider;
import io.github.georgecodes.benchmarking.vertx.infra.MetricsProvider;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServerResponse;
import io.vertx.ext.web.Route;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class HelloRoutesHandlerTest {

    @Test
    void missingNullAndBlankParametersReturnImmediateResponseAndCountEachRequest() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        Metrics.addRegistry(registry);
        try {
            HelloRoutes routes = new HelloRoutes(new HelloService(CacheProvider.create(1)),
                    MetricsProvider.create("/hello/reactive"));
            Handler<RoutingContext> handler = captureReactiveHandler(routes);
            int requestCount = 0;

            // Null collections/values are defensive cases supplied by a RoutingContext adapter;
            // real HTTP requests normally supply empty lists for absent query parameters.
            for (List<String> values : Arrays.asList(null, List.<String>of(),
                    Collections.<String>singletonList(null), List.of(""), List.of(" "),
                    List.of(" 0 "), List.of("-1"))) {
                AtomicInteger status = new AtomicInteger();
                Map<String, String> headers = new HashMap<>();
                AtomicReference<String> body = new AtomicReference<>();
                HttpServerResponse response = proxy(HttpServerResponse.class, (self, method, args) -> switch (method.getName()) {
                    case "setStatusCode" -> {
                        status.set((Integer) args[0]);
                        yield self;
                    }
                    case "putHeader" -> {
                        headers.put(args[0].toString(), args[1].toString());
                        yield self;
                    }
                    case "end" -> {
                        body.set((String) args[0]);
                        yield Future.succeededFuture();
                    }
                    default -> throw new AssertionError("Unexpected response call: " + method);
                });
                RoutingContext context = proxy(RoutingContext.class, (_, method, _) -> switch (method.getName()) {
                    case "queryParam" -> values;
                    case "response" -> response;
                    default -> throw new AssertionError("Unexpected context call: " + method);
                });

                handler.handle(context);

                assertEquals(200, status.get());
                assertEquals("application/json", headers.get("content-type"));
                assertEquals("\"Hello from Vertx reactive REST value-1\"", body.get());
                assertEquals(++requestCount, registry.get("hello.request.count")
                        .tag("endpoint", "/hello/reactive").counter().count());
            }
        } finally {
            Metrics.removeRegistry(registry);
            registry.close();
        }
    }

    @SuppressWarnings("unchecked")
    private static Handler<RoutingContext> captureReactiveHandler(HelloRoutes routes) {
        AtomicReference<Handler<RoutingContext>> handler = new AtomicReference<>();
        Route reactive = proxy(Route.class, (self, method, args) -> {
            if ("handler".equals(method.getName())) {
                handler.set((Handler<RoutingContext>) args[0]);
                return self;
            }
            throw new AssertionError("Unexpected route call: " + method);
        });
        Route ready = proxy(Route.class, (self, method, _) -> {
            if ("handler".equals(method.getName())) {
                return self;
            }
            throw new AssertionError("Unexpected route call: " + method);
        });
        Router router = proxy(Router.class, (_, method, args) -> {
            if ("get".equals(method.getName())) {
                return "/hello/reactive".equals(args[0]) ? reactive : ready;
            }
            throw new AssertionError("Unexpected router call: " + method);
        });
        Vertx vertx = proxy(Vertx.class, (_, method, _) -> {
            throw new AssertionError("Non-positive sleep must not schedule a timer: " + method);
        });

        routes.register(router, vertx);
        assertNotNull(handler.get());
        return handler.get();
    }

    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
                (self, method, args) -> {
                    if (method.getDeclaringClass() == Object.class) {
                        return switch (method.getName()) {
                            case "hashCode" -> System.identityHashCode(self);
                            case "equals" -> self == args[0];
                            case "toString" -> type.getSimpleName() + " test proxy";
                            default -> throw new AssertionError("Unexpected Object method: " + method);
                        };
                    }
                    return handler.invoke(self, method, args);
                }));
    }
}
