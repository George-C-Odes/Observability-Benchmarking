package io.github.georgecodes.benchmarking.pekko.domain;

import com.github.benmanes.caffeine.cache.Cache;
import org.jspecify.annotations.NonNull;

import java.util.Objects;

/**
 * Pure domain logic for the hello endpoint.
 * Stateless aside from the injected cache; safe to call from any thread.
 */
public final class HelloService {

    /** Hot-path cache key. */
    private static final String CACHE_KEY = "1";

    /** Cache used to simulate typical service lookups and memory access patterns. */
    private final Cache<@NonNull String, String> cache;

    public HelloService(Cache<@NonNull String, String> cache) {
        this.cache = Objects.requireNonNull(cache, "cache");
    }

    /**
     * Produces the hello response for the given mode.
     *
     * @param mode the hello mode (determines response prefix)
     * @return the formatted response string
     */
    public String handle(HelloMode mode) {
        Objects.requireNonNull(mode, "mode");
        String v = cache.getIfPresent(CACHE_KEY);
        return mode.responsePrefix() + v;
    }
}