package com.benchmarking.rest;

import com.github.benmanes.caffeine.cache.Cache;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.jspecify.annotations.NonNull;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(value = "/hello", produces = MediaType.APPLICATION_JSON_VALUE)
@Slf4j
public class HelloController {
    private final Cache<@NonNull String, String> cache;
    private final Counter reactiveCounter;
    
    private final Counter httpServerReactiveCounter;
    
    private final MeterRegistry meterRegistry;

    @Autowired
    public HelloController(Cache<@NonNull String, String> cache, MeterRegistry meterRegistry) {
        this.cache = cache;
        this.meterRegistry = meterRegistry;
        // Pre-populate cache with some entries for testing
        for (int i = 50_000; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }
        this.reactiveCounter = Counter.builder("spring.request.count")
            .tag("endpoint", "/hello/reactive")
            .tag("http.method", "GET")
            .register(meterRegistry);
        
        // Register OpenTelemetry-compliant HTTP server metrics
        this.httpServerReactiveCounter = Counter.builder("http.server.requests")
            .tag("http.route", "/hello/reactive")
            .tag("http.method", "GET")
            .tag("http.status_code", "200")
            .register(meterRegistry);
        log.info("Init thread: {}", Thread.currentThread());
        var runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        log.info("Heap in MB = Max:{}, Total:{}, Free:{}", maxHeapMB, totalHeapMB, freeHeapMB);
    }

    @GetMapping(value = "/reactive")
//    @Timed(value = "spring.request.time", extraTags = {"endpoint", "/hello/reactive"}, percentiles = {0.5, 0.9, 0.95, 0.99}, histogram = true)
//    @Counted(value = "spring.request.count", extraTags = {"endpoint", "/hello/reactive"})
    @SuppressWarnings("BlockingMethodInNonBlockingContext")
    public Mono<@NonNull String> reactive(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) {
        return Mono.fromSupplier(() -> {
            reactiveCounter.increment();
            httpServerReactiveCounter.increment();
            if (printLog) {
                log.info("reactive thread: '{}'", Thread.currentThread());
                //reactor-http-nio-...
            }
            if (sleepSeconds > 0) {
                try {
                    Thread.sleep(sleepSeconds * 1000L);
                } catch (InterruptedException ignored) {}
            }
            String v = cache.getIfPresent("1");
            return "Hello from Boot reactive REST " + v;
        });
    }
}