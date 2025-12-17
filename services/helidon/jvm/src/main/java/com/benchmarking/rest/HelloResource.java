package com.benchmarking.rest;

import com.github.benmanes.caffeine.cache.Cache;
import io.helidon.common.context.Contexts;
import io.helidon.webserver.http.HttpRules;
import io.helidon.webserver.http.HttpService;
import io.helidon.webserver.http.ServerRequest;
import io.helidon.webserver.http.ServerResponse;

import java.util.concurrent.Executors;

/**
 * REST service providing hello endpoints with different thread models.
 * Supports platform threads, virtual threads, and reactive programming models.
 * Used for benchmarking observability and performance characteristics.
 */
public class HelloResource implements HttpService {

    private final Cache<String, String> cache;

    /**
     * Constructs the HelloResource with required dependencies.
     *
     * @param cache the Caffeine cache instance for storing key-value pairs
     */
    public HelloResource(Cache<String, String> cache) {
        this.cache = cache;
        
        Runtime runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        System.out.println("Init thread: " + Thread.currentThread());
        System.out.println("Heap in MB = Max:" + maxHeapMB + ", Total:" + totalHeapMB 
                + ", Free:" + freeHeapMB);
        System.out.println("Available Processors:" + runtime.availableProcessors());
    }

    @Override
    public void routing(HttpRules rules) {
        rules
            .get("/platform", this::handlePlatform)
            .get("/virtual", this::handleVirtual)
            .get("/reactive", this::handleReactive);
    }

    /**
     * Handles requests using platform threads (standard JVM threads).
     *
     * @param req the HTTP request
     * @param res the HTTP response
     */
    private void handlePlatform(ServerRequest req, ServerResponse res) {
        try {
            int sleepSeconds = req.query().first("sleep").map(Integer::parseInt).orElse(0);
            boolean printLog = req.query().first("log").map(Boolean::parseBoolean).orElse(false);

            if (printLog) {
                System.out.println("platform thread: " + Thread.currentThread());
            }
            if (sleepSeconds > 0) {
                Thread.sleep(sleepSeconds * 1000L);
            }
            String value = cache.getIfPresent("1");
            res.send("Hello from Helidon platform REST " + value);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            res.status(500).send("Interrupted");
        }
    }

    /**
     * Handles requests using virtual threads (Project Loom).
     *
     * @param req the HTTP request
     * @param res the HTTP response
     */
    private void handleVirtual(ServerRequest req, ServerResponse res) {
        // Execute on virtual thread
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            executor.submit(() -> {
                try {
                    int sleepSeconds = req.query().first("sleep").map(Integer::parseInt).orElse(0);
                    boolean printLog = req.query().first("log")
                            .map(Boolean::parseBoolean).orElse(false);

                    if (printLog) {
                        System.out.println("virtual thread: " + Thread.currentThread());
                    }
                    if (sleepSeconds > 0) {
                        Thread.sleep(sleepSeconds * 1000L);
                    }
                    String value = cache.getIfPresent("1");
                    
                    // Use Helidon context to send response from virtual thread
                    Contexts.runInContext(req.context(), 
                            () -> res.send("Hello from Helidon virtual REST " + value));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    Contexts.runInContext(req.context(), () -> res.status(500).send("Interrupted"));
                }
            }).get();
        } catch (Exception e) {
            res.status(500).send("Error: " + e.getMessage());
        }
    }

    /**
     * Handles requests using reactive programming model.
     * In Helidon, this uses async non-blocking I/O on the event loop.
     *
     * @param req the HTTP request
     * @param res the HTTP response
     */
    private void handleReactive(ServerRequest req, ServerResponse res) {
        int sleepSeconds = req.query().first("sleep").map(Integer::parseInt).orElse(0);
        boolean printLog = req.query().first("log").map(Boolean::parseBoolean).orElse(false);

        if (printLog) {
            System.out.println("reactive thread: " + Thread.currentThread());
        }
        
        // In Helidon 4, reactive means using async/non-blocking on event loop
        // For true async, we'd use CompletableFuture but for benchmarking cache 
        // access, simple response is appropriate
        if (sleepSeconds > 0) {
            try {
                Thread.sleep(sleepSeconds * 1000L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        
        String value = cache.getIfPresent("1");
        res.send("Hello from Helidon reactive REST " + value);
    }
}
