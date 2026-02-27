package io.github.georgecodes.benchmarking.helidon.se;

import io.github.georgecodes.benchmarking.helidon.se.infra.ObservabilityFeatureFactory;
import io.github.georgecodes.benchmarking.helidon.se.infra.cache.CaffeineCacheAdapter;
import io.github.georgecodes.benchmarking.helidon.se.infra.metrics.JvmExtrasMetricsConfiguration;
import io.github.georgecodes.benchmarking.helidon.se.infra.metrics.MicrometerMetricsAdapter;
import io.github.georgecodes.benchmarking.helidon.se.infra.metrics.OtelConfig;
import io.github.georgecodes.benchmarking.helidon.se.infra.time.ThreadSleepAdapter;
import io.github.georgecodes.benchmarking.helidon.se.application.HelloService;
import io.github.georgecodes.benchmarking.helidon.se.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.se.web.HelloRouting;
import io.github.georgecodes.benchmarking.helidon.se.web.HttpMetricsFilter;
import io.helidon.config.Config;
import io.helidon.webserver.WebServer;
import io.helidon.webserver.observe.ObserveFeature;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.bridge.SLF4JBridgeHandler;

/**
 * Helidon SE application entry point.
 * <p>
 * Helidon 4 is virtual-thread–first: every request handler runs
 * on a virtual thread by default — no executor annotations needed.
 */
@Slf4j
public final class HelidonApplication {

    private HelidonApplication() {
    }

    static void main(String[] ignoredArgs) {
        // Route JUL → SLF4J → Logback
        SLF4JBridgeHandler.removeHandlersForRootLogger();
        SLF4JBridgeHandler.install();

        // Load Helidon config (classpath application.yaml)
        Config config = Config.create();

        int cacheSize = config.get("CACHE_SIZE").asInt()
                .or(() -> config.get("benchmark.cache.size").asInt().asOptional())
                .orElse(50_000);

        // ── Wire application components ──
        var cachePort = new CaffeineCacheAdapter(cacheSize);
        var metricsPort = new MicrometerMetricsAdapter();
        var sleepPort = new ThreadSleepAdapter();
        var helloService = new HelloService(cachePort, metricsPort, sleepPort);

        // ── Observability: OTel SDK autoconfigure ──
        OpenTelemetry openTelemetry = OtelConfig.initialize();
        OtelConfig.bridgeMicrometer(openTelemetry);
        OpenTelemetryAppender.install(openTelemetry);

        // ── Register JVM extras meter binders ──
        new JvmExtrasMetricsConfiguration(Metrics.globalRegistry).register();

        // ── Pre-warm Micrometer counters for known endpoints ──
        for (HelloMode mode : HelloMode.values()) {
            metricsPort.warmUp(mode.endpointTag());
        }

        // ── Health check & observability feature ──
        ObserveFeature observe = ObservabilityFeatureFactory.create("helidon-se-jvm");

        // ── Micrometer HTTP metrics (http.server.requests Timer) ──
        // Enabled via HELIDON_MICROMETER_ENABLED env var (default: true).
        boolean micrometerEnabled = config.get("HELIDON_MICROMETER_ENABLED").asBoolean().orElse(true);

        if (micrometerEnabled) {
            log.info("HTTP metrics filter enabled — http.server.requests metrics active");
        }

        // ── Start WebServer ──
        WebServer server = WebServer.builder()
                .config(config.get("server"))
                .addFeature(observe)
                .routing(routing -> {
                    if (micrometerEnabled) {
                        routing.addFilter(new HttpMetricsFilter());
                    }
                    HelloRouting.register(routing, helloService);
                })
                .build()
                .start();

        Runtime runtime = Runtime.getRuntime();
        log.info("Helidon version: {}", io.helidon.common.Version.VERSION);
        log.info("Heap in MB = Max:{}, Total:{}, Free:{}",
                runtime.maxMemory() / 1024 / 1024,
                runtime.totalMemory() / 1024 / 1024,
                runtime.freeMemory() / 1024 / 1024);
        log.info("Available Processors: {}", runtime.availableProcessors());
        log.info("Helidon WebServer started on http://localhost:{}", server.port());
    }
}