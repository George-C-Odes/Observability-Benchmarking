package com.benchmarking.rest;

import com.github.benmanes.caffeine.cache.Cache;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.jspecify.annotations.NonNull;

@RestController
@RequestMapping(value = "/hello", produces = MediaType.APPLICATION_JSON_VALUE)
@Slf4j
public class HelloController {
    @Value("${spring.threads.virtual.enabled:false}")
    private boolean virtualThreadsEnabled;
    private final Cache<@NonNull String, String> cache;
    private final Counter platformCounter;
    private final Counter virtualCounter;
    private final MeterRegistry meterRegistry;

    @Autowired
    public HelloController(Cache<@NonNull String, String> cache, MeterRegistry meterRegistry) {
        this.cache = cache;
        this.meterRegistry = meterRegistry;
        // Pre-populate cache with some entries for testing
        for (int i = 50_000; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }
        this.platformCounter = Counter.builder("spring.request.count")
            .tag("endpoint", "/hello/platform")
            .tag("http.method", "GET")
            .register(meterRegistry);
        this.virtualCounter = Counter.builder("spring.request.count")
            .tag("endpoint", "/hello/virtual")
            .tag("http.method", "GET")
            .register(meterRegistry);
        log.info("Init thread: {}", Thread.currentThread());
        var runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        log.info("Heap in MB = Max:{}, Total:{}, Free:{}", maxHeapMB, totalHeapMB, freeHeapMB);
    }

    @GetMapping(value = "/platform")
//    @Timed(value = "spring.request.time", extraTags = {"endpoint", "/hello/platform"}, percentiles = {0.5, 0.9, 0.95, 0.99}, histogram = true)
//    @Counted(value = "spring.request.count", extraTags = {"endpoint", "/hello/platform"})
    public String platform(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) throws InterruptedException {
        if (virtualThreadsEnabled) {
            throw new IllegalStateException("Virtual threads are enabled");
        }
        platformCounter.increment();
        recordHttpMetrics("/hello/platform", "GET", 200);
        if (printLog) {
            log.info("platform thread: '{}'", Thread.currentThread());
            //http-nio-...
        }
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return "Hello from Boot platform REST " + v;
    }

    @GetMapping(value = "/virtual")
//    @Timed(value = "spring.request.time", extraTags = {"endpoint", "/hello/virtual"}, percentiles = {0.5, 0.9, 0.95, 0.99}, histogram = true)
//    @Counted(value = "spring.request.count", extraTags = {"endpoint", "/hello/virtual"})
    public String virtual(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) throws InterruptedException {
        if (!virtualThreadsEnabled) {
            throw new IllegalStateException("Virtual threads are disabled");
        }
        virtualCounter.increment();
        recordHttpMetrics("/hello/virtual", "GET", 200);
        if (printLog) {
            log.info("virtual thread: '{}'", Thread.currentThread());
            //VirtualThread[#...
        }
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return "Hello from Boot virtual REST " + v;
    }

    private void recordHttpMetrics(String endpoint, String method, int statusCode) {
        Counter.builder("http.server.requests")
            .tag("http.route", endpoint)
            .tag("http.method", method)
            .tag("http.status_code", String.valueOf(statusCode))
            .register(meterRegistry)
            .increment();
    }
}