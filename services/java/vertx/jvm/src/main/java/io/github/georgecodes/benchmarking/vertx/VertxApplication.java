package io.github.georgecodes.benchmarking.vertx;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.vertx.config.ServiceConfig;
import io.github.georgecodes.benchmarking.vertx.domain.HelloMode;
import io.github.georgecodes.benchmarking.vertx.domain.HelloService;
import io.github.georgecodes.benchmarking.vertx.infra.CacheProvider;
import io.github.georgecodes.benchmarking.vertx.infra.MetricsProvider;
import io.github.georgecodes.benchmarking.vertx.web.HelloRoutes;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.binder.jvm.ClassLoaderMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmGcMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmMemoryMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmThreadMetrics;
import io.micrometer.core.instrument.binder.system.ProcessorMetrics;
import io.vertx.core.Vertx;
import io.vertx.core.VertxOptions;
import io.vertx.core.http.HttpServer;
import io.vertx.core.http.HttpServerOptions;
import io.vertx.ext.web.Router;
import io.vertx.micrometer.MicrometerMetricsFactory;
import io.vertx.micrometer.MicrometerMetricsOptions;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.TreeSet;

/**
 * Vert.x JVM application entry point.
 *
 * <p>Runs a fully reactive HTTP server on the Vert.x event loop — no blocking,
 * no virtual threads — tuned for maximum throughput on a 2-vCPU container.
 */
public final class VertxApplication {

    /** Logger for application lifecycle and configuration output. */
    private static final Logger LOG = LoggerFactory.getLogger(VertxApplication.class);

    private VertxApplication() {
    }

    static void main() {
        ServiceConfig config = ServiceConfig.fromEnvironment();

        // Wire infrastructure
        MetricsProvider metricsProvider = MetricsProvider.create(HelloMode.REACTIVE.endpointTag());
        Cache<@NonNull String, String> cache = CacheProvider.create(config.cacheSize());
        HelloService helloService = new HelloService(cache);

        // Bind standard JVM metrics to Micrometer global registry
        bindJvmMetrics();

        LOG.info("Init thread: {}", Thread.currentThread());
        Runtime runtime = Runtime.getRuntime();
        LOG.info("Heap in MB = Max:{}, Total:{}, Free:{}",
            runtime.maxMemory() / 1024 / 1024,
            runtime.totalMemory() / 1024 / 1024,
            runtime.freeMemory() / 1024 / 1024);
        LOG.info("Available Processors:{}", runtime.availableProcessors());
        LOG.info("SERVICE_PORT={} EVENT_LOOP_SIZE={}", config.port(), config.resolvedEventLoopSize());

        // Configure Vert.x with Micrometer metrics and tuned event-loop pool
        VertxOptions vertxOptions = new VertxOptions()
            .setEventLoopPoolSize(config.resolvedEventLoopSize())
            .setPreferNativeTransport(true)
            .setMetricsOptions(new MicrometerMetricsOptions()
                .setEnabled(true));

        Vertx vertx = Vertx.builder()
            .with(vertxOptions)
            .withMetrics(new MicrometerMetricsFactory(Metrics.globalRegistry))
            .build();

        // Set up router and routes
        Router router = Router.router(vertx);
        HelloRoutes helloRoutes = new HelloRoutes(helloService, metricsProvider);
        helloRoutes.register(router, vertx);

        // HTTP server options tuned for benchmarking on 2 vCPUs
        HttpServerOptions serverOptions = new HttpServerOptions()
            .setHost("0.0.0.0")
            .setPort(config.port())
            .setTcpNoDelay(true)         // Disable Nagle: send short responses immediately
            .setTcpFastOpen(true)        // Reduce TCP handshake latency
            .setTcpQuickAck(true)        // ACK segments immediately
            .setReusePort(true)          // Allow multiple accept threads per port (Linux SO_REUSEPORT)
            .setCompressionSupported(false)  // No compression: short JSON payloads + saves CPU
            .setAcceptBacklog(8192)      // Large accept backlog for burst handling
            .setIdleTimeout(60);         // Seconds

        // Create one HTTP server per event-loop thread for optimal throughput
        int instances = config.resolvedEventLoopSize();
        for (int i = 0; i < instances; i++) {
            HttpServer server = vertx.createHttpServer(serverOptions);
            server.requestHandler(router)
                .listen()
                .onSuccess(s -> LOG.info("Vert.x HTTP server instance listening on port {}", s.actualPort()))
                .onFailure(err -> {
                    LOG.error("Failed to start Vert.x HTTP server", err);
                    vertx.close();
                });
        }

        // Graceful shutdown
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOG.info("Shutting down Vert.x...");
            vertx.close();
        }, "vertx-shutdown"));

        // Optional: log registered meters
        if (Boolean.parseBoolean(System.getenv("LOG_METERS"))) {
            var meterNames = new TreeSet<String>();
            Metrics.globalRegistry.getMeters().forEach(m -> meterNames.add(m.getId().getName()));
            LOG.info("Registered meters ({}): {}", meterNames.size(), meterNames);
        }

        LOG.info("Vert.x service started on port {} with {} event-loop threads",
            config.port(), config.resolvedEventLoopSize());
    }

    @SuppressWarnings("resource") // JvmGcMetrics lives for the entire application lifetime
    private static void bindJvmMetrics() {
        var registry = Metrics.globalRegistry;
        new ClassLoaderMetrics().bindTo(registry);
        new JvmMemoryMetrics().bindTo(registry);
        new JvmGcMetrics().bindTo(registry);
        new JvmThreadMetrics().bindTo(registry);
        new ProcessorMetrics().bindTo(registry);
    }
}