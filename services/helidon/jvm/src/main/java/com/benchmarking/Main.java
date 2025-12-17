package com.benchmarking;

import com.benchmarking.config.CacheConfig;
import com.benchmarking.rest.HelloResource;
import io.helidon.config.Config;
import io.helidon.logging.common.LogConfig;
import io.helidon.webserver.WebServer;
import io.helidon.webserver.observe.ObserveFeature;
import io.helidon.webserver.observe.health.HealthObserver;
import io.helidon.webserver.observe.metrics.MetricsObserver;

/**
 * Main entry point for the Helidon benchmark service.
 * Configures and starts the Helidon WebServer with observability features.
 */
public class Main {

    private Main() {
    }

    /**
     * Main method to start the Helidon server.
     *
     * @param args command line arguments (not used)
     */
    public static void main(String[] args) {
        // Configure logging
        LogConfig.configureRuntime();

        // Load configuration
        Config config = Config.create();
        Config.global(config);

        // Initialize cache
        CacheConfig cacheConfig = new CacheConfig();

        // Create routing with hello service
        HelloResource helloResource = new HelloResource(cacheConfig.cache());

        // Build and start the server
        WebServer server = WebServer.builder()
                .config(config.get("server"))
                .addFeature(ObserveFeature.builder()
                        .config(config.get("server.features.observe"))
                        .addObserver(HealthObserver.create())
                        .addObserver(MetricsObserver.create())
                        .build())
                .routing(routing -> routing
                        .register("/hello", helloResource)
                )
                .build()
                .start();

        System.out.println("Helidon server started on port: " + server.port());
        System.out.println("Try the endpoints:");
        System.out.println("  http://localhost:" + server.port() + "/hello/platform");
        System.out.println("  http://localhost:" + server.port() + "/hello/virtual");
        System.out.println("  http://localhost:" + server.port() + "/hello/reactive");
        System.out.println("  http://localhost:" + server.port() + "/observe/health");
        System.out.println("  http://localhost:" + server.port() + "/observe/metrics");
    }
}
