package io.github.georgecodes.benchmarking.helidon.se.web;

import io.github.georgecodes.benchmarking.helidon.se.application.HelloService;
import io.github.georgecodes.benchmarking.helidon.se.application.port.HelloMode;
import io.helidon.http.HeaderNames;
import io.helidon.http.HeaderValues;
import io.helidon.webserver.http.HttpRouting;
import io.helidon.webserver.http.ServerRequest;
import io.helidon.webserver.http.ServerResponse;
import lombok.extern.slf4j.Slf4j;

import java.nio.charset.StandardCharsets;

/**
 * Helidon SE routing for the hello benchmark endpoints.
 * <p>
 * Helidon 4 is virtual-thread–first: every handler runs on a virtual thread
 * by default. No executor annotation is needed.
 * <p>
 * Routes are auto-registered for every {@link HelloMode} variant,
 * so adding a new mode requires no changes here (OCP).
 * <p>
 * Every request hits the Caffeine cache to simulate a realistic
 * service lookup, consistent with all other benchmark modules.
 */
@Slf4j
public final class HelloRouting {

    /** Pre-computed Content-Type header to avoid per-request object creation. */
    private static final io.helidon.http.Header CONTENT_TYPE_JSON =
            HeaderValues.create(HeaderNames.CONTENT_TYPE, "application/json");

    private HelloRouting() {
    }

    /**
     * Registers a GET endpoint for every {@link HelloMode} on the given routing builder.
     *
     * @param routing      Helidon HTTP routing builder
     * @param helloService the use-case service
     */
    public static void register(HttpRouting.Builder routing, HelloService helloService) {
        for (HelloMode mode : HelloMode.values()) {
            routing.get(mode.endpointTag(), (req, res) ->
                    handleHello(req, res, helloService, mode));
        }
    }

    private static void handleHello(ServerRequest req,
                                    ServerResponse res,
                                    HelloService helloService,
                                    HelloMode mode) throws InterruptedException {
        int sleep = req.query().first("sleep").map(Integer::parseInt).orElse(0);
        boolean printLog = req.query().first("log").map(Boolean::parseBoolean).orElse(false);

        if (printLog) {
            var currentThread = Thread.currentThread();
            log.info("{} thread: '{}' (name='{}'), isVirtual: '{}'",
                    mode.label(), currentThread, currentThread.getName(), currentThread.isVirtual());
        }

        res.header(CONTENT_TYPE_JSON);

        String result = helloService.hello(mode, sleep);
        byte[] body = ("\"" + result + "\"").getBytes(StandardCharsets.UTF_8);
        res.send(body);
    }
}