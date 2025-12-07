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

@JBossLog
@Path("/hello")
@Produces(MediaType.APPLICATION_JSON)
public class HelloResource {

    Cache<@NonNull String, String> cache;
    private final Counter platformCounter;
    private final Counter virtualCounter;
    private final Counter reactiveCounter;
    
    private final Counter httpServerPlatformCounter;
    private final Counter httpServerVirtualCounter;
    private final Counter httpServerReactiveCounter;

    private final MeterRegistry meterRegistry;

    @Inject
    public HelloResource(Cache<@NonNull String, String> cache, MeterRegistry meterRegistry) {
        this.cache = cache;
        this.meterRegistry = meterRegistry;
        // Pre-populate cache with some entries for testing
        for (int i = 50_000; i > 0; i--) {
            this.cache.put(String.valueOf(i), "value-" + i);
        }
        this.platformCounter = Counter.builder("quarkus.request.count")
            .tag("endpoint", "/hello/platform")
            .tag("http.method", "GET")
            .register(meterRegistry);
        this.virtualCounter = Counter.builder("quarkus.request.count")
            .tag("endpoint", "/hello/virtual")
            .tag("http.method", "GET")
            .register(meterRegistry);
        this.reactiveCounter = Counter.builder("quarkus.request.count")
            .tag("endpoint", "/hello/reactive")
            .tag("http.method", "GET")
            .register(meterRegistry);
        
        // Register OpenTelemetry-compliant HTTP server metrics
        this.httpServerPlatformCounter = Counter.builder("http.server.requests")
            .tag("http.route", "/hello/platform")
            .tag("http.method", "GET")
            .tag("http.status_code", "200")
            .register(meterRegistry);
        this.httpServerVirtualCounter = Counter.builder("http.server.requests")
            .tag("http.route", "/hello/virtual")
            .tag("http.method", "GET")
            .tag("http.status_code", "200")
            .register(meterRegistry);
        this.httpServerReactiveCounter = Counter.builder("http.server.requests")
            .tag("http.route", "/hello/reactive")
            .tag("http.method", "GET")
            .tag("http.status_code", "200")
            .register(meterRegistry);

        log.infov("Init thread: {0}", Thread.currentThread());
        var runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        log.infov("Heap in MB = Max:{0}, Total:{1}, Free:{2}", maxHeapMB, totalHeapMB, freeHeapMB);
    }

    @GET
    @Blocking
    @Path("/platform")
//    @Timed(value = "quarkus.request.time", extraTags = {"endpoint", "/hello/platform"}, percentiles = {0.5, 0.9, 0.95, 0.99}, histogram = true)
//    @Counted(value = "quarkus.request.count", extraTags = {"endpoint", "/hello/platform"})
    public String helloPlatform(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) throws InterruptedException {
//        String env = propertiesService.getMyEnv();
//        log.infov("My Env: {0}", env);
        platformCounter.increment();
        httpServerPlatformCounter.increment();
        if (printLog) {
            log.infov("platform thread: {0}", Thread.currentThread());
            //Thread[#95,executor-thread-1,5,main]
        }
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return "Hello from Quarkus platform REST " + v;
    }

    @GET
    @Path("/virtual")
    @RunOnVirtualThread
//    @Timed(value = "quarkus.request.time", extraTags = {"endpoint", "/hello/virtual"}, percentiles = {0.5, 0.9, 0.95, 0.99}, histogram = true)
//    @Counted(value = "quarkus.request.count", extraTags = {"endpoint", "/hello/virtual"})
    public String helloVirtual(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) throws InterruptedException {
        virtualCounter.increment();
        httpServerVirtualCounter.increment();
        if (printLog) {
            log.infov("virtual thread: {0}", Thread.currentThread());
            //VirtualThread[#813259,vthread-813108]
        }
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return "Hello from Quarkus virtual REST " + v;
    }

    @GET
    @Path("/reactive")
//    @Timed(value = "quarkus.request.time", extraTags = {"endpoint", "/hello/reactive"}, percentiles = {0.5, 0.9, 0.95, 0.99}, histogram = true)
//    @Counted(value = "quarkus.request.count", extraTags = {"endpoint", "/hello/reactive"})
    public Uni<String> helloReactive(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) {
        return Uni.createFrom().item(() -> {
            reactiveCounter.increment();
            httpServerReactiveCounter.increment();
            if (printLog) {
                log.infov("reactive thread: {0}", Thread.currentThread());
                //Thread[#119,vert.x-eventloop-thread-15,5,main]
            }
            if (sleepSeconds > 0) { //Not really meant to be used under load
                try {
                    Thread.sleep(sleepSeconds * 1000L);
                } catch (InterruptedException ignored) {}
            }
            String v = cache.getIfPresent("1");
            return "Hello from Quarkus reactive REST " + v;
        });
    }
}