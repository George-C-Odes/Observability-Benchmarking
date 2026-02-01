package io.github.georgecodes.benchmarking.javalin.jvm;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.javalin.jvm.config.ServiceConfig;
import io.github.georgecodes.benchmarking.javalin.jvm.domain.HelloService;
import io.github.georgecodes.benchmarking.javalin.jvm.infra.CacheProvider;
import io.github.georgecodes.benchmarking.javalin.jvm.infra.MetricsProvider;
import io.github.georgecodes.benchmarking.javalin.jvm.web.HelloRoutes;
import io.javalin.Javalin;
import io.javalin.config.JavalinConfig;
import io.javalin.json.JavalinJackson;
import io.micrometer.core.instrument.MeterRegistry;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Javalin JVM application entry point.
 */
public final class JavalinApplication {

    private static final Logger LOG = LoggerFactory.getLogger(JavalinApplication.class);

    private JavalinApplication() {
    }

    public static void main(String[] args) {
        ServiceConfig config = ServiceConfig.fromEnvironment();

        MeterRegistry meterRegistry = MetricsProvider.bindToGlobal();
        Cache<@NonNull String, String> cache = CacheProvider.create(config.cacheSize());
        HelloService helloService = new HelloService(cache);

        ExecutorService executor = createHandlerExecutor(config);
        Runtime.getRuntime().addShutdownHook(new Thread(executor::close, "executor-shutdown"));

        LOG.info("Init thread: {}", Thread.currentThread());
        Runtime runtime = Runtime.getRuntime();
        LOG.info("Heap in MB = Max:{}, Total:{}, Free:{}",
            runtime.maxMemory() / 1024 / 1024,
            runtime.totalMemory() / 1024 / 1024,
            runtime.freeMemory() / 1024 / 1024);
        LOG.info("Available Processors:{}", runtime.availableProcessors());
        LOG.info("THREAD_MODE={} SERVICE_PORT={}", config.threadMode(), config.port());

        Javalin app = Javalin.create(jc -> configure(jc, config));

        new HelloRoutes(config, executor, helloService, meterRegistry).register(app);

        // Keep behavior similar to Spark service (optional)
        if (Boolean.parseBoolean(System.getenv("LOG_METERS"))) {
            var meterNames = new TreeSet<String>();
            meterRegistry.getMeters().forEach(m -> meterNames.add(m.getId().getName()));
            LOG.info("Registered meters ({}): {}", meterNames.size(), meterNames);
        }

        app.start("0.0.0.0", config.port());
        LOG.info("Javalin service started on port {}", config.port());
    }

    private static void configure(JavalinConfig jc, ServiceConfig config) {
        // We output plain text. Still initialize JSON mapper to avoid surprises when Javalin needs it.
        jc.jsonMapper(new JavalinJackson());

        // Disable noisy banners for benchmark clarity.
        jc.showJavalinBanner = false;

        // Let Javalin run handlers on virtual threads when enabled.
        jc.useVirtualThreads = config.threadMode() == ServiceConfig.ThreadMode.VIRTUAL;

        // Jetty tuning knobs.
        // IMPORTANT: When jc.useVirtualThreads=true, Javalin will create a virtual-thread-backed Jetty thread pool
        // if we don't override it. If we set a QueuedThreadPool here, we force platform threads.
        if (config.threadMode() == ServiceConfig.ThreadMode.PLATFORM) {
            int maxThreads = config.jettyMaxThreads() > 0
                ? config.jettyMaxThreads()
                : Math.max(8, Runtime.getRuntime().availableProcessors() * 8);
            int minThreads = config.jettyMinThreads() > 0
                ? config.jettyMinThreads()
                : Math.max(2, Runtime.getRuntime().availableProcessors());

            jc.jetty.threadPool = new org.eclipse.jetty.util.thread.QueuedThreadPool(maxThreads, minThreads);
        }

        jc.jetty.modifyServer(server -> tuneJetty(server, config));
    }

    private static void tuneJetty(Server server, ServiceConfig config) {
        server.setStopAtShutdown(true);

        for (var connector : server.getConnectors()) {
            if (connector instanceof ServerConnector sc) {
                sc.setAcceptQueueSize(config.jettyAcceptQueueSize());
                sc.setIdleTimeout(config.jettyIdleTimeoutMs());
            }
        }
    }

    private static ExecutorService createHandlerExecutor(ServiceConfig config) {
        if (config.handlerExecutionMode() == ServiceConfig.HandlerExecutionMode.DIRECT) {
            return Executors.newFixedThreadPool(1);
        }

        return switch (config.threadMode()) {
            case PLATFORM -> {
                int threads = config.platformExecutorThreads() > 0
                    ? config.platformExecutorThreads()
                    : Math.max(1, Runtime.getRuntime().availableProcessors() * 2);
                yield Executors.newFixedThreadPool(threads);
            }
            case VIRTUAL -> Executors.newVirtualThreadPerTaskExecutor();
        };
    }
}
