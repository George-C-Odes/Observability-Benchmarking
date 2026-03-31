package io.github.georgecodes.benchmarking.vertx.web;

import io.github.georgecodes.benchmarking.vertx.domain.HelloMode;
import io.github.georgecodes.benchmarking.vertx.domain.HelloService;
import io.github.georgecodes.benchmarking.vertx.infra.MetricsProvider;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;

/**
 * HTTP routes for the Vert.x reactive hello endpoint.
 *
 * <p>All handler code runs on the Vert.x event-loop; blocking operations
 * (e.g., sleep for benchmarking) are dispatched via {@code vertx.setTimer} to
 * avoid blocking the event loop.
 */
public final class HelloRoutes {

    /** Logger for request/thread debug output. */
    private static final Logger LOG = LoggerFactory.getLogger(HelloRoutes.class);

    /** Content-Type header value. */
    private static final String APPLICATION_JSON = "application/json";

    /** Pure domain logic for hello responses. */
    private final HelloService helloService;

    /** Metrics for the reactive endpoint. */
    private final MetricsProvider metricsProvider;

    public HelloRoutes(HelloService helloService, MetricsProvider metricsProvider) {
        this.helloService = Objects.requireNonNull(helloService, "helloService");
        this.metricsProvider = Objects.requireNonNull(metricsProvider, "metricsProvider");
    }

    /**
     * Registers all routes on the given router.
     *
     * @param router the Vert.x web router
     * @param vertx  the Vert.x instance (needed for timer-based sleep)
     */
    public void register(Router router, Vertx vertx) {
        Objects.requireNonNull(router, "router");
        Objects.requireNonNull(vertx, "vertx");

        router.get("/ready").handler(ctx -> ctx.response()
            .setStatusCode(200)
            .putHeader("content-type", "text/plain")
            .end("UP"));

        router.get("/hello/reactive").handler(ctx -> handleReactive(ctx, vertx));
    }

    private void handleReactive(RoutingContext ctx, Vertx vertx) {
        metricsProvider.incrementReactive();

        int sleepSeconds = parseIntParam(ctx.queryParam("sleep"));
        boolean printLog = parseBoolParam(ctx.queryParam("log"));

        if (printLog) {
            var currentThread = Thread.currentThread();
            LOG.info("reactive thread: '{}', isVirtual: '{}'", currentThread, currentThread.isVirtual());
        }

        if (sleepSeconds > 0) {
            // Non-blocking sleep using Vert.x timer — never blocks the event loop.
            vertx.setTimer(sleepSeconds * 1000L, _ -> respondJson(ctx));
        } else {
            respondJson(ctx);
        }
    }

    private void respondJson(RoutingContext ctx) {
        String body = "\"" + helloService.handle(HelloMode.REACTIVE) + "\"";
        ctx.response()
            .setStatusCode(200)
            .putHeader("content-type", APPLICATION_JSON)
            .end(body);
    }

    private static int parseIntParam(java.util.List<String> values) {
        if (values == null || values.isEmpty()) {
            return 0;
        }
        String v = values.getFirst();
        if (v == null || v.isBlank()) {
            return 0;
        }
        return Integer.parseInt(v.trim());
    }

    private static boolean parseBoolParam(java.util.List<String> values) {
        if (values == null || values.isEmpty()) {
            return false;
        }
        return Boolean.parseBoolean(values.getFirst());
    }
}