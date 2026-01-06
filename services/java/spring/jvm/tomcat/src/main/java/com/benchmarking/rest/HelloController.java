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

/**
 * REST controller providing platform and virtual thread endpoints for Spring MVC.
 * Supports both traditional platform threads and Java virtual threads.
 */
@RestController
@RequestMapping(value = "/hello", produces = MediaType.APPLICATION_JSON_VALUE)
@Slf4j
public class HelloController {
    @Value("${spring.threads.virtual.enabled:false}")
    private boolean virtualThreadsEnabled;
    private final Cache<@NonNull String, String> cache;
    private final Counter platformCounter;
    private final Counter virtualCounter;

    /**
     * Constructs the HelloController with required dependencies.
     *
     * @param cache the Caffeine cache instance for storing key-value pairs
     * @param meterRegistry the Micrometer registry for metrics collection
     */
    @Autowired
    public HelloController(Cache<@NonNull String, String> cache, MeterRegistry meterRegistry) {
        this.cache = cache;
        this.platformCounter = Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/platform").register(meterRegistry);
        this.virtualCounter = Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/virtual").register(meterRegistry);
        log.info("Init thread: {}", Thread.currentThread());
        var runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        log.info("Heap in MB = Max:{}, Total:{}, Free:{}", maxHeapMB, totalHeapMB, freeHeapMB);
        log.info("Available Processors:{}", runtime.availableProcessors());
    }

    /**
     * Handles requests using platform threads (standard JVM threads).
     *
     * @param sleepSeconds optional sleep duration in seconds for simulating work
     * @param printLog whether to log thread information
     * @return greeting message with cached value
     * @throws InterruptedException if the thread sleep is interrupted
     */
    @GetMapping(value = "/platform")
    public String platform(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) throws InterruptedException {
        if (virtualThreadsEnabled) {
            throw new IllegalStateException("Virtual threads are enabled");
        }
        platformCounter.increment();
        if (printLog) {
            log.info("platform thread: '{}'", Thread.currentThread());
        }
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return "Hello from Boot platform REST " + v;
    }

    /**
     * Handles requests using virtual threads (Project Loom).
     *
     * @param sleepSeconds optional sleep duration in seconds for simulating work
     * @param printLog whether to log thread information
     * @return greeting message with cached value
     * @throws InterruptedException if the thread sleep is interrupted
     */
    @GetMapping(value = "/virtual")
    public String virtual(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) throws InterruptedException {
        if (!virtualThreadsEnabled) {
            throw new IllegalStateException("Virtual threads are disabled");
        }
        virtualCounter.increment();
        if (printLog) {
            log.info("virtual thread: '{}'", Thread.currentThread());
        }
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return "Hello from Boot virtual REST " + v;
    }
}
