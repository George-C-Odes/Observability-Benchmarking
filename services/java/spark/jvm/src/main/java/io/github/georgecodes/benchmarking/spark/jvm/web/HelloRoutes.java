package io.github.georgecodes.benchmarking.spark.jvm.web;

import io.github.georgecodes.benchmarking.spark.jvm.config.ServiceConfig;
import io.github.georgecodes.benchmarking.spark.jvm.domain.HelloService;
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

    /** Counter for /hello/platform. */
    private final Counter platformCounter;
    /** Counter for /hello/virtual. */
    private final Counter virtualCounter;

    public HelloRoutes(
        ServiceConfig config,
        ExecutorService executor,
        HelloService helloService,
        MeterRegistry meterRegistry
    ) {
        this.config = Objects.requireNonNull(config, "config");
        this.executor = Objects.requireNonNull(executor, "executor");
        this.helloService = Objects.requireNonNull(helloService, "helloService");

        this.platformCounter = Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .register(meterRegistry);
        this.virtualCounter = Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/virtual")
            .register(meterRegistry);
    }

    public void register() {
        get("/hello/platform", (req, res) -> {
            if (config.threadMode() != ServiceConfig.ThreadMode.PLATFORM) {
                throw new IllegalStateException("Virtual threads are enabled");
            }
            platformCounter.increment();
            boolean printLog = Boolean.parseBoolean(req.queryParams("log"));
            int sleepSeconds = parseInt(req.queryParams("sleep"), 0);
            if (printLog) {
                LOG.info("platform thread: '{}'", Thread.currentThread());
            }

            if (config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.DIRECT) {
                return helloService.handle("Hello from Spark platform REST ", sleepSeconds);
            }

            return submitAndJoin(() -> helloService.handle("Hello from Spark platform REST ", sleepSeconds));
        });

        get("/hello/virtual", (req, res) -> {
            if (config.threadMode() != ServiceConfig.ThreadMode.VIRTUAL) {
                throw new IllegalStateException("Virtual threads are disabled");
            }
            virtualCounter.increment();
            boolean printLog = Boolean.parseBoolean(req.queryParams("log"));
            int sleepSeconds = parseInt(req.queryParams("sleep"), 0);
            if (printLog) {
                LOG.info("virtual thread: '{}'", Thread.currentThread());
            }

            boolean mustOffload = config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.OFFLOAD
                || config.virtualExecutionMode() == ServiceConfig.VirtualExecutionMode.OFFLOAD;

            if (!mustOffload) {
                return helloService.handle("Hello from Spark virtual REST ", sleepSeconds);
            }

            return submitAndJoin(() -> helloService.handle("Hello from Spark virtual REST ", sleepSeconds));
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
