package com.benchmarking.rest;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.smallrye.common.annotation.Blocking;
import io.smallrye.common.annotation.RunOnVirtualThread;
import io.smallrye.mutiny.Uni;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.DefaultValue;
import lombok.extern.jbosslog.JBossLog;
import com.github.benmanes.caffeine.cache.Cache;
import org.jspecify.annotations.NonNull;

/**
 * REST resource providing hello endpoints with different thread models.
 * Supports platform threads, virtual threads, and reactive programming models.
 * Used for benchmarking observability and performance characteristics.
 */
@JBossLog
@Path("/hello")
@Produces(MediaType.APPLICATION_JSON)
public class HelloResource {

    /**
     * Caffeine cache instance for storing key-value pairs.
     */
    Cache<@NonNull String, String> cache;
    
    /**
     * Micrometer counter for tracking platform thread requests.
     */
    private final Counter platformCounter;
    
    /**
     * Micrometer counter for tracking virtual thread requests.
     */
    private final Counter virtualCounter;
    
    /**
     * Micrometer counter for tracking reactive requests.
     */
    private final Counter reactiveCounter;

    /**
     * Constructs the HelloResource with required dependencies.
     *
     * @param cache the Caffeine cache instance for storing key-value pairs
     * @param meterRegistry the Micrometer registry for metrics collection
     */
    @Inject
    public HelloResource(Cache<@NonNull String, String> cache, MeterRegistry meterRegistry) {
        this.cache = cache;
        this.platformCounter = Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/platform").register(meterRegistry);
        this.virtualCounter = Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/virtual").register(meterRegistry);
        this.reactiveCounter = Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/reactive").register(meterRegistry);
        log.infov("Init thread: {0}", Thread.currentThread());
        var runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        log.infov("Heap in MB = Max:{0}, Total:{1}, Free:{2}", maxHeapMB, totalHeapMB, freeHeapMB);
        log.infov("Available Processors:{0}", runtime.availableProcessors());
    }

    /**
     * Handles requests using platform threads (standard JVM threads).
     *
     * @param sleepSeconds optional sleep duration in seconds for simulating work
     * @param printLog whether to log thread information
     * @return greeting message with cached value
     * @throws InterruptedException if the thread sleep is interrupted
     */
    @GET
    @Blocking
    @Path("/platform")
    public String helloPlatform(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) throws InterruptedException {
        platformCounter.increment();
        if (printLog) {
            log.infov("platform thread: {0}", Thread.currentThread());
        }
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return "Hello from Quarkus platform REST " + v;
    }

    /**
     * Handles requests using virtual threads (Project Loom).
     *
     * @param sleepSeconds optional sleep duration in seconds for simulating work
     * @param printLog whether to log thread information
     * @return greeting message with cached value
     * @throws InterruptedException if the thread sleep is interrupted
     */
    @GET
    @Path("/virtual")
    @RunOnVirtualThread
    public String helloVirtual(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) throws InterruptedException {
        virtualCounter.increment();
        if (printLog) {
            log.infov("virtual thread: {0}", Thread.currentThread());
        }
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return "Hello from Quarkus virtual REST " + v;
    }

    /**
     * Handles requests using reactive programming model with Mutiny.
     *
     * @param sleepSeconds optional sleep duration in seconds (not recommended under load)
     * @param printLog whether to log thread information
     * @return Uni with greeting message and cached value
     */
    @GET
    @Path("/reactive")
    public Uni<String> helloReactive(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) {
        return Uni.createFrom().item(() -> {
            reactiveCounter.increment();
            if (printLog) {
                log.infov("reactive thread: {0}", Thread.currentThread());
            }
            if (sleepSeconds > 0) {
                try {
                    Thread.sleep(sleepSeconds * 1000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    // Restore interrupt status for reactive context
                }
            }
            String v = cache.getIfPresent("1");
            return "Hello from Quarkus reactive REST " + v;
        });
    }
}
