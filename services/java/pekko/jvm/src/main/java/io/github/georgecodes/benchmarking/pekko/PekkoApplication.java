package io.github.georgecodes.benchmarking.pekko;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.pekko.config.ServiceConfig;
import io.github.georgecodes.benchmarking.pekko.domain.HelloMode;
import io.github.georgecodes.benchmarking.pekko.domain.HelloService;
import io.github.georgecodes.benchmarking.pekko.infra.CacheProvider;
import io.github.georgecodes.benchmarking.pekko.infra.MetricsProvider;
import io.github.georgecodes.benchmarking.pekko.web.HelloRoutes;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.binder.jvm.ClassLoaderMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmGcMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmMemoryMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmThreadMetrics;
import io.micrometer.core.instrument.binder.system.ProcessorMetrics;
import org.apache.pekko.actor.ActorSystem;
import org.apache.pekko.http.javadsl.Http;
import org.apache.pekko.http.javadsl.ServerBinding;
import org.apache.pekko.http.javadsl.server.Route;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.TreeSet;
import java.util.concurrent.CompletionStage;

/**
 * Pekko JVM application entry point.
 *
 * <p>Runs an embedded Pekko HTTP server — fully reactive, no blocking,
 * tuned for maximum throughput on a 2-vCPU container.
 */
public final class PekkoApplication {

    /** Logger emitted by the OpenTelemetry SDK when the span export queue overflows. */
    private static final String OTEL_BSP_LOGGER_NAME = "io.opentelemetry.sdk.trace.export.BatchSpanProcessor";

    /** Environment/system-property key controlling BatchSpanProcessor warning visibility. */
    private static final String OTEL_BSP_LOG_LEVEL = "OTEL_BSP_LOG_LEVEL";

    /** Logger for application lifecycle and configuration output. */
    private static final Logger LOG = LoggerFactory.getLogger(PekkoApplication.class);

    private PekkoApplication() {
    }

    static void main() {
        configureOpenTelemetryLogNoise();

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
        LOG.info("Available Processors: {}", runtime.availableProcessors());
        LOG.info("SERVICE_PORT={}", config.port());

        // Boot Pekko ActorSystem (loads application.conf automatically)
        ActorSystem system = ActorSystem.create("application");

        // Build routes
        HelloRoutes helloRoutes = new HelloRoutes(helloService, metricsProvider, system);
        Route routes = helloRoutes.routes();

        // Start Pekko HTTP server
        CompletionStage<ServerBinding> bindingFuture =
            Http.get(system)
                .newServerAt("0.0.0.0", config.port())
                .bind(routes);

        bindingFuture.thenAccept(binding ->
            LOG.info("Pekko HTTP server listening on {}",
                binding.localAddress())
        );

        // Graceful shutdown
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOG.info("Shutting down Pekko HTTP server...");
            bindingFuture.thenCompose(ServerBinding::unbind)
                .thenAccept(ignored -> system.terminate());
        }, "pekko-shutdown"));

        // Optional: log registered meters
        if (Boolean.parseBoolean(System.getenv("LOG_METERS"))) {
            var meterNames = new TreeSet<String>();
            Metrics.globalRegistry.getMeters().forEach(m -> meterNames.add(m.getId().getName()));
            LOG.info("Registered meters ({}): {}", meterNames.size(), meterNames);
        }

        LOG.info("Pekko HTTP service started on port {}", config.port());
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

    private static void configureOpenTelemetryLogNoise() {
        var loggerFactory = LoggerFactory.getILoggerFactory();
        if (!(loggerFactory instanceof LoggerContext context)) {
            return;
        }

        Level level = Level.toLevel(resolveOpenTelemetryBatchSpanProcessorLogLevel(), Level.WARN);
        context.getLogger(OTEL_BSP_LOGGER_NAME).setLevel(level);
        context.getLogger(OTEL_BSP_LOGGER_NAME + "$Worker").setLevel(level);
    }

    private static String resolveOpenTelemetryBatchSpanProcessorLogLevel() {
        String environmentVariable = System.getenv(OTEL_BSP_LOG_LEVEL);
        if (environmentVariable != null && !environmentVariable.isBlank()) {
            return environmentVariable;
        }

        String systemProperty = System.getProperty(OTEL_BSP_LOG_LEVEL);
        if (systemProperty != null && !systemProperty.isBlank()) {
            return systemProperty;
        }

        return "WARN";
    }
}