package io.github.georgecodes.benchmarking.spark.web;

import io.github.georgecodes.benchmarking.spark.config.ServiceConfig;
import io.github.georgecodes.benchmarking.spark.domain.HelloService;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;

import static spark.Spark.get;

/**
 * HTTP routes for SparkJava.
 */
public final class HelloRoutes {

    /** Logger. */
    private static final Logger LOG = LoggerFactory.getLogger(HelloRoutes.class);

    /** Service configuration. */
    private final ServiceConfig config;
    /** Optional executor used when offloading is enabled. */
    private final ExecutorService executor;
    /** Domain handler. */
    private final HelloService helloService;

    /** Minimal metrics boundary for the web layer. */
    private interface HelloMetrics {
        void incrementHello();
    }

    private static final class MicrometerHelloMetrics implements HelloMetrics {
        private final Counter helloCounter;

        private MicrometerHelloMetrics(Counter helloCounter) {
            this.helloCounter = Objects.requireNonNull(helloCounter, "helloCounter");
        }

        @Override
        public void incrementHello() {
            helloCounter.increment();
        }
    }

    /** Parsed request params for /hello endpoints. */
    private record HelloParams(int sleepSeconds, boolean log) {
        static HelloParams from(spark.Request req) {
            int sleepSeconds = parseInt(req.queryParams("sleep"), 0);
            boolean log = Boolean.parseBoolean(req.queryParams("log"));
            return new HelloParams(sleepSeconds, log);
        }
    }

    /** Counter for the active endpoint. */
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

        String endpoint = switch (config.threadMode()) {
            case PLATFORM -> "/hello/platform";
            case VIRTUAL -> "/hello/virtual";
        };

        Counter counter = Counter.builder("hello.request.count")
            .tag("endpoint", endpoint)
            .register(meterRegistry);
        this.metrics = new MicrometerHelloMetrics(counter);
    }

    public void register() {
        // Minimal readiness endpoint for orchestration/liveness checks.
        // Independent of thread/offload configuration for minimal overhead.
        get("/ready", (_, res) -> {
            res.status(200);
            res.type("text/plain");
            return "UP";
        });

        switch (config.threadMode()) {
            case PLATFORM -> registerPlatform();
            case VIRTUAL -> registerVirtual();
            default -> throw new IllegalStateException("Unsupported THREAD_MODE: " + config.threadMode());
        }
    }

    private void registerPlatform() {
        get("/hello/platform", (req, _) -> {
            metrics.incrementHello();
            HelloParams params = HelloParams.from(req);
            if (params.log()) {
                var currentThread = Thread.currentThread();
                LOG.info("platform thread: '{}', isVirtual: '{}'", currentThread, currentThread.isVirtual());
            }

            if (config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.DIRECT) {
                return helloService.handle("Hello from Spark platform REST ", params.sleepSeconds());
            }

            return submitAndJoin(() -> helloService.handle("Hello from Spark platform REST ", params.sleepSeconds()));
        });
    }

    private void registerVirtual() {
        get("/hello/virtual", (req, _) -> {
            metrics.incrementHello();
            HelloParams params = HelloParams.from(req);
            if (params.log()) {
                var currentThread = Thread.currentThread();
                LOG.info("virtual thread: '{}', isVirtual: '{}'", currentThread, currentThread.isVirtual());
            }

            boolean mustOffload = config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.OFFLOAD
                || config.virtualExecutionMode() == ServiceConfig.VirtualExecutionMode.OFFLOAD;

            if (!mustOffload) {
                return helloService.handle("Hello from Spark virtual REST ", params.sleepSeconds());
            }

            return submitAndJoin(() -> helloService.handle("Hello from Spark virtual REST ", params.sleepSeconds()));
        });
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
}
