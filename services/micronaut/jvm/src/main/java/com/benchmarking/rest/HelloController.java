package com.benchmarking.rest;

import com.benchmarking.config.CacheConfig;
import com.github.benmanes.caffeine.cache.Cache;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.QueryValue;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * REST controller providing hello endpoints with different thread models.
 * Supports platform threads, virtual threads, and reactive programming models.
 * Used for benchmarking observability and performance characteristics.
 */
@Controller("/hello")
public class HelloController {

    private final Cache<String, String> cache;

    /**
     * Constructs the HelloController with required dependencies.
     *
     * @param cacheConfig the cache configuration providing the cache instance
     */
    public HelloController(CacheConfig cacheConfig) {
        this.cache = cacheConfig.getCache();
    }

    /**
     * Handles requests using platform threads (standard JVM threads).
     *
     * @param sleepSeconds optional sleep duration in seconds
     * @param printLog whether to log thread information
     * @return greeting message with cached value
     * @throws InterruptedException if the thread sleep is interrupted
     */
    @Get("/platform")
    @ExecuteOn(TaskExecutors.BLOCKING)
    public String platform(
            @QueryValue(defaultValue = "0") int sleep,
            @QueryValue(defaultValue = "false") boolean log
    ) throws InterruptedException {
        if (log) {
            System.out.println("platform thread: " + Thread.currentThread());
        }
        if (sleep > 0) {
            Thread.sleep(sleep * 1000L);
        }
        String value = cache.getIfPresent("1");
        return "Hello from Micronaut platform REST " + value;
    }

    /**
     * Handles requests using virtual threads (Project Loom).
     * Micronaut will use virtual threads when configured with Java 21+.
     *
     * @param sleepSeconds optional sleep duration in seconds
     * @param printLog whether to log thread information
     * @return greeting message with cached value
     * @throws InterruptedException if the thread sleep is interrupted
     */
    @Get("/virtual")
    @ExecuteOn(TaskExecutors.BLOCKING)
    public String virtual(
            @QueryValue(defaultValue = "0") int sleep,
            @QueryValue(defaultValue = "false") boolean log
    ) throws InterruptedException {
        if (log) {
            System.out.println("virtual thread: " + Thread.currentThread());
        }
        if (sleep > 0) {
            Thread.sleep(sleep * 1000L);
        }
        String value = cache.getIfPresent("1");
        return "Hello from Micronaut virtual REST " + value;
    }

    /**
     * Handles requests using reactive programming model with Reactor.
     *
     * @param sleepSeconds optional sleep duration in seconds (not recommended under load)
     * @param printLog whether to log thread information
     * @return Mono with greeting message and cached value
     */
    @Get("/reactive")
    public Mono<String> reactive(
            @QueryValue(defaultValue = "0") int sleep,
            @QueryValue(defaultValue = "false") boolean log
    ) {
        return Mono.fromCallable(() -> {
            if (log) {
                System.out.println("reactive thread: " + Thread.currentThread());
            }
            if (sleep > 0) {
                try {
                    Thread.sleep(sleep * 1000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    // Restore interrupt status for reactive context
                }
            }
            String value = cache.getIfPresent("1");
            return "Hello from Micronaut reactive REST " + value;
        }).subscribeOn(Schedulers.boundedElastic());
    }
}
