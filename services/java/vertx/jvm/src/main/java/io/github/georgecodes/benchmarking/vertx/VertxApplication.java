package io.github.georgecodes.benchmarking.vertx;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.vertx.config.ServiceConfig;
import io.github.georgecodes.benchmarking.vertx.domain.HelloMode;
import io.github.georgecodes.benchmarking.vertx.domain.HelloService;
import io.github.georgecodes.benchmarking.vertx.infra.CacheProvider;
import io.github.georgecodes.benchmarking.vertx.infra.MetricsProvider;
import io.github.georgecodes.benchmarking.vertx.web.HttpServerVerticle;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.binder.jvm.ClassLoaderMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmGcMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmMemoryMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmThreadMetrics;
import io.micrometer.core.instrument.binder.system.ProcessorMetrics;
import io.vertx.core.DeploymentOptions;
import io.vertx.core.Vertx;
import io.vertx.core.VertxOptions;
import io.vertx.core.http.HttpServerOptions;
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
 *
 * <p>Each event-loop thread owns its own {@link HttpServerVerticle} instance
 * (and therefore its own Router and HttpServer), which is the idiomatic Vert.x
 * way to distribute accept + request processing across all available cores.
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
        int eventLoopSize = config.resolvedEventLoopSize();
        VertxOptions vertxOptions = new VertxOptions()
            .setEventLoopPoolSize(eventLoopSize)
            .setPreferNativeTransport(true)
            .setMetricsOptions(new MicrometerMetricsOptions()
                .setEnabled(true));

        Vertx vertx = Vertx.builder()
            .with(vertxOptions)
            .withMetrics(new MicrometerMetricsFactory(Metrics.globalRegistry))
            .build();

        // Native epoll transport is available only on Linux (Docker runtime).
        // SO_REUSEPORT requires native transport; enabling it on NIO silently does nothing,
        // but we gate it to keep the intent explicit.
        boolean linux = System.getProperty("os.name", "").toLowerCase().contains("linux");
        LOG.info("Native epoll transport expected: {} (os.name={})", linux, System.getProperty("os.name"));

        // HTTP server options tuned for benchmarking on 2 vCPUs
        HttpServerOptions serverOptions = new HttpServerOptions()
            .setHost("0.0.0.0")
            .setPort(config.port())
            .setTcpNoDelay(true)         // Disable Nagle: send short responses immediately
            .setTcpFastOpen(true)        // Reduce TCP handshake latency
            .setTcpQuickAck(true)        // ACK segments immediately
            .setReusePort(linux)         // SO_REUSEPORT only works with native epoll on Linux
            .setCompressionSupported(false)  // No compression: short JSON payloads + saves CPU
            .setAcceptBacklog(8192)      // Large accept backlog for burst handling
            .setIdleTimeout(60);         // Seconds

        // Deploy N verticle instances — each gets its own event-loop thread,
        // its own Router, and its own HttpServer. This is the idiomatic Vert.x
        // way to utilise all available CPU cores.
        DeploymentOptions deploymentOptions = new DeploymentOptions()
            .setInstances(eventLoopSize);

        vertx.deployVerticle(
                () -> new HttpServerVerticle(config.port(), helloService, metricsProvider, serverOptions),
                deploymentOptions)
            .onSuccess(id -> LOG.info("Deployed {} HttpServerVerticle instances (id={})", eventLoopSize, id))
            .onFailure(err -> {
                LOG.error("Failed to deploy HttpServerVerticle instances", err);
                vertx.close();
            });

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