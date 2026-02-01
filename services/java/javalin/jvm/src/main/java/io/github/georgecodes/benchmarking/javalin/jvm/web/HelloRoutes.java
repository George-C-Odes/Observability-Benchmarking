package io.github.georgecodes.benchmarking.javalin.jvm.web;

import io.github.georgecodes.benchmarking.javalin.jvm.config.ServiceConfig;
import io.github.georgecodes.benchmarking.javalin.jvm.domain.HelloService;
import io.javalin.Javalin;
import io.javalin.http.Context;
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

    private static final Logger LOG = LoggerFactory.getLogger(HelloRoutes.class);

    private final ServiceConfig config;
    private final ExecutorService executor;
    private final HelloService helloService;

    private final Counter platformCounter;
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

    public void register(Javalin app) {
        app.get("/hello/platform", ctx -> {
            if (config.threadMode() != ServiceConfig.ThreadMode.PLATFORM) {
                throw new IllegalStateException("Virtual threads are enabled");
            }
            platformCounter.increment();
            int sleepSeconds = parseInt(ctx.queryParam("sleep"), 0);

            if (config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.DIRECT) {
                logThread(ctx, "platform");
                ctx.result(helloService.handle("Hello from Javalin platform REST ", sleepSeconds));
                return;
            }

            ctx.result(submitAndJoin(() -> {
                logThread(ctx, "platform");
                return helloService.handle("Hello from Javalin platform REST ", sleepSeconds);
            }));
        });

        app.get("/hello/virtual", ctx -> {
            if (config.threadMode() != ServiceConfig.ThreadMode.VIRTUAL) {
                throw new IllegalStateException("Virtual threads are disabled");
            }
            virtualCounter.increment();
            int sleepSeconds = parseInt(ctx.queryParam("sleep"), 0);

            if (config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.DIRECT) {
                logThread(ctx, "virtual");
                ctx.result(helloService.handle("Hello from Javalin virtual REST ", sleepSeconds));
                return;
            }

            ctx.result(submitAndJoin(() -> {
                logThread(ctx, "virtual");
                return helloService.handle("Hello from Javalin virtual REST ", sleepSeconds);
            }));
        });
    }

    private static void logThread(Context ctx, String mode) {
        if (!parseBoolean(ctx.queryParam("log"))) {
            return;
        }
        Thread t = Thread.currentThread();
        LOG.info("{} thread: '{}' (isVirtual={})", mode, t, t.isVirtual());
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
