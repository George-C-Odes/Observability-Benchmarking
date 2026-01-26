package io.github.georgecodes.benchmarking.spark.jvm;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.spark.jvm.config.ServiceConfig;
import io.github.georgecodes.benchmarking.spark.jvm.domain.HelloService;
import io.github.georgecodes.benchmarking.spark.jvm.infra.CacheProvider;
import io.github.georgecodes.benchmarking.spark.jvm.infra.MetricsProvider;
import io.github.georgecodes.benchmarking.spark.jvm.web.HelloRoutes;
import io.micrometer.core.instrument.MeterRegistry;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static spark.Spark.awaitInitialization;
import static spark.Spark.ipAddress;
import static spark.Spark.port;
import static spark.Spark.threadPool;
import static spark.Spark.useVirtualThread;

/**
 * Spark JVM application entry point.
 */
public final class SparkApplication {

    /** Logger. */
    private static final Logger LOG = LoggerFactory.getLogger(SparkApplication.class);

    private SparkApplication() {
    }

    static void main(String[] args) {
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

        ipAddress("0.0.0.0");
        port(config.port());

        // Configure Spark/Jetty threading.
        // - acceptQueueSize maps to Jetty accept queue.
        // - max/min are best tuned per benchmark scenario.
        int maxThreads = config.jettyMaxThreads() > 0
            ? config.jettyMaxThreads()
            : Math.max(8, Runtime.getRuntime().availableProcessors() * 8);
        int minThreads = config.jettyMinThreads() > 0
            ? config.jettyMinThreads()
            : Math.max(2, Runtime.getRuntime().availableProcessors());
        threadPool(maxThreads, minThreads, config.jettyAcceptQueueSize());

        // Toggle Spark's built-in virtual-thread mode (provided by this fork).
        // If the service is in VIRTUAL mode but virtualExecutionMode==OFFLOAD, we keep Spark in platform mode
        // and enforce vthreads via offloading.
        boolean sparkVthreads = config.threadMode() == ServiceConfig.ThreadMode.VIRTUAL
            && config.virtualExecutionMode() == ServiceConfig.VirtualExecutionMode.SPARK;
        useVirtualThread(sparkVthreads);

        new HelloRoutes(config, executor, helloService, meterRegistry).register();

        if (Boolean.parseBoolean(System.getenv("LOG_METERS"))) {
            var meterNames = new TreeSet<String>();
            meterRegistry.getMeters().forEach(m -> meterNames.add(m.getId().getName()));
            LOG.info("Registered meters ({}): {}", meterNames.size(), meterNames);
        }

        awaitInitialization();
        LOG.info("Spark service started on port {}", config.port());
    }

    private static ExecutorService createHandlerExecutor(ServiceConfig config) {
        // DIRECT mode: keep executor minimal; HelloRoutes will avoid using it.
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
