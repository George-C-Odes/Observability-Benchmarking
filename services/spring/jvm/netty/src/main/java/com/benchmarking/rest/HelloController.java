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

/**
 * REST controller providing reactive hello endpoint for Spring WebFlux.
 * Handles requests using reactive programming with Reactor.
 */
@RestController
@RequestMapping(value = "/hello", produces = MediaType.APPLICATION_JSON_VALUE)
@Slf4j
public class HelloController {
    private final Cache<@NonNull String, String> cache;
    private final Counter reactiveCounter;

    /**
     * Constructs the HelloController with required dependencies.
     *
     * @param cache the Caffeine cache instance for storing key-value pairs
     * @param meterRegistry the Micrometer registry for metrics collection
     */
    @Autowired
    public HelloController(Cache<@NonNull String, String> cache, MeterRegistry meterRegistry) {
        this.cache = cache;
        // Pre-populate cache with some entries for testing
        for (int i = 50_000; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }
        this.reactiveCounter = Counter.builder("spring.request.count")
                .tag("endpoint", "/hello/reactive").register(meterRegistry);
        log.info("Init thread: {}", Thread.currentThread());
        var runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        log.info("Heap in MB = Max:{}, Total:{}, Free:{}", maxHeapMB, totalHeapMB, freeHeapMB);
    }

    /**
     * Handles reactive requests returning a Mono response.
     *
     * @param sleepSeconds optional sleep duration in seconds for simulating work
     * @param printLog whether to log thread information
     * @return Mono containing greeting message with cached value
     */
    @GetMapping(value = "/reactive")
    @SuppressWarnings("BlockingMethodInNonBlockingContext")
    public Mono<@NonNull String> reactive(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) {
        return Mono.fromSupplier(() -> {
            reactiveCounter.increment();
            if (printLog) {
                log.info("reactive thread: '{}'", Thread.currentThread());
            }
            if (sleepSeconds > 0) {
                try {
                    Thread.sleep(sleepSeconds * 1000L);
                } catch (InterruptedException ignored) {
                    // Ignored for reactive context
                }
            }
            String v = cache.getIfPresent("1");
            return "Hello from Boot reactive REST " + v;
        });
    }
}
