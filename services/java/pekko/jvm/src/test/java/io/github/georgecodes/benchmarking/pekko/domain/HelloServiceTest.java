package io.github.georgecodes.benchmarking.pekko.domain;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Unit tests for {@link HelloService}.
 */
class HelloServiceTest {

    private HelloService helloService;

    @BeforeEach
    void setUp() {
        Cache<String, String> cache = Caffeine.newBuilder()
            .maximumSize(100)
            .expireAfterWrite(Duration.ofDays(1))
            .build();
        cache.put("1", "value-1");
        helloService = new HelloService(cache);
    }

    @Test
    void handleReactive_returnsExpectedResponse() {
        String result = helloService.handle(HelloMode.REACTIVE);
        assertNotNull(result);
        assertEquals("Hello from Pekko reactive REST value-1", result);
    }

    @Test
    void handle_nullMode_throwsNullPointerException() {
        assertThrows(NullPointerException.class, () -> helloService.handle(null));
    }

    @Test
    void constructor_nullCache_throwsNullPointerException() {
        assertThrows(NullPointerException.class, () -> new HelloService(null));
    }
}