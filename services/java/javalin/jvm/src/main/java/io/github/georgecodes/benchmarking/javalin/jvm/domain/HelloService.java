package io.github.georgecodes.benchmarking.javalin.jvm.domain;

import com.github.benmanes.caffeine.cache.Cache;
import org.jspecify.annotations.NonNull;

/**
 * Pure "business" logic for the hello endpoints.
 */
public final class HelloService {

    /** Cache used to simulate typical service lookups and memory access patterns. */
    private final Cache<@NonNull String, String> cache;

    public HelloService(Cache<@NonNull String, String> cache) {
        this.cache = cache;
    }

    public String handle(String prefix, int sleepSeconds) throws InterruptedException {
        if (sleepSeconds > 0) {
            Thread.sleep(sleepSeconds * 1000L);
        }
        String v = cache.getIfPresent("1");
        return prefix + v;
    }
}
