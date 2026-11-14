package io.github.georgecodes.benchmarking.spring.tomcat.infra.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CaffeineCacheAdapterTest {

    @Test
    void returnsCachedValueForPresentKey() {
        Cache<String, String> cache = Caffeine.newBuilder().build();
        cache.put("1", "value-1");

        assertThat(new CaffeineCacheAdapter(cache).get("1")).isEqualTo("value-1");
    }

    @Test
    void returnsEmptyStringForMissingKey() {
        Cache<String, String> cache = Caffeine.newBuilder().build();

        assertThat(new CaffeineCacheAdapter(cache).get("missing")).isEmpty();
        assertThat(cache.asMap()).isEmpty();
    }
}
