package io.github.georgecodes.benchmarking.javalin.web;

import io.github.georgecodes.benchmarking.javalin.config.ServiceConfig;
import io.github.georgecodes.benchmarking.javalin.domain.HelloService;
import io.javalin.config.RoutesConfig;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;

/**
 * HTTP routes for Javalin.
 */
public final class HelloRoutes {

    /** Logger for request/thread debug output. */
    private static final Logger LOG = LoggerFactory.getLogger(HelloRoutes.class);

    /** Service configuration (thread and handler execution modes). */
    private final ServiceConfig config;
    /** Executor used when handler execution is configured to OFFLOAD. */
    private final ExecutorService executor;
    /** Pure domain logic for hello responses. */
    private final HelloService helloService;

    /** Minimal metrics boundary for the web layer. */
    private interface HelloMetrics {
        void incrementHello();
    }

    private static final class MicrometerHelloMetrics implements HelloMetrics {
        /** Micrometer counter tracking hello endpoint invocations. */
        private final Counter helloCounter;

        private MicrometerHelloMetrics(Counter helloCounter) {
            this.helloCounter = Objects.requireNonNull(helloCounter, "helloCounter");
        }

        @Override
        public void incrementHello() {
            helloCounter.increment();
        }
    }

    /**
     * Parsed request params for /hello endpoints.
     *
     * @param sleepSeconds optional sleep duration in seconds (0 = no sleep)
     * @param log whether to log thread information for the request
     */
    private record HelloParams(int sleepSeconds, boolean log) {
        static HelloParams from(Context ctx) {
            int sleepSeconds = parseInt(ctx.queryParam("sleep"), 0);
            boolean log = parseBoolean(ctx.queryParam("log"));
            return new HelloParams(sleepSeconds, log);
        }
    }

    /** Request counter for the single enabled hello endpoint (platform OR virtual). */
    private final HelloMetrics metrics;

    public HelloRoutes(
        ServiceConfig config,
        ExecutorService executor,
        HelloService helloService,
        MeterRegistry meterRegistry
    ) {
        this.config = Objects.requireNonNull(config, "config");
        this.executor = Objects.requireNonNull(executor, "executor");
        this.helloService = Objects.requireNonNull(helloService, "helloService");

        Objects.requireNonNull(meterRegistry, "meterRegistry");

        String endpointTagValue = switch (config.threadMode()) {
            case PLATFORM -> "/hello/platform";
            case VIRTUAL -> "/hello/virtual";
        };

        Counter counter = Counter.builder("hello.request.count")
            .tag("endpoint", endpointTagValue)
            .register(meterRegistry);
        this.metrics = new MicrometerHelloMetrics(counter);
    }

    public void register(RoutesConfig routes) {
        Objects.requireNonNull(routes, "routes");

        // Minimal readiness endpoint for orchestration/liveness checks.
        // Keep it independent of thread/offload configuration to reduce complexity and overhead.
        routes.get("/ready", ctx -> {
            ctx.status(HttpStatus.OK);
            ctx.result("UP");
        });

        switch (config.threadMode()) {
            case PLATFORM -> registerPlatform(routes);
            case VIRTUAL -> registerVirtual(routes);
            default -> throw new IllegalStateException("Unsupported THREAD_MODE: " + config.threadMode());
        }
    }

    private void registerPlatform(RoutesConfig routes) {
        routes.get("/hello/platform", ctx -> {
            metrics.incrementHello();
            HelloParams params = HelloParams.from(ctx);

            if (config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.DIRECT) {
                logThread(params, "platform");
                ctx.json(helloService.handle("Hello from Javalin platform REST ", params.sleepSeconds()));
                return;
            }

            ctx.json(submitAndJoin(() -> {
                logThread(params, "platform");
                return helloService.handle("Hello from Javalin platform REST ", params.sleepSeconds());
            }));
        });
    }

    private void registerVirtual(RoutesConfig routes) {
        routes.get("/hello/virtual", ctx -> {
            metrics.incrementHello();
            HelloParams params = HelloParams.from(ctx);

            if (config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.DIRECT) {
                logThread(params, "virtual");
                ctx.json(helloService.handle("Hello from Javalin virtual REST ", params.sleepSeconds()));
                return;
            }

            ctx.json(submitAndJoin(() -> {
                logThread(params, "virtual");
                return helloService.handle("Hello from Javalin virtual REST ", params.sleepSeconds());
            }));
        });
    }

    private static void logThread(HelloParams params, String mode) {
        if (!params.log()) {
            return;
        }
        var currentThread = Thread.currentThread();
        LOG.info("{} thread: '{}', isVirtual: '{}'", mode, currentThread, currentThread.isVirtual());
    }

    private String submitAndJoin(ThrowingSupplier<String> supplier) throws Exception {
        try {
            return executor.submit(supplier::get).get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception ex) {
                throw ex;
            }
            throw e;
        }
    }

    @FunctionalInterface
    private interface ThrowingSupplier<T> {
        T get() throws Exception;
    }

    private static int parseInt(String value, int defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return Integer.parseInt(value.trim());
    }

    private static boolean parseBoolean(String value) {
        return Boolean.parseBoolean(value);
    }
}
