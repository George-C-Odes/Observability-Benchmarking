package io.github.georgecodes.benchmarking.pekko.domain;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Unit tests for {@link HelloMode}.
 */
class HelloModeTest {

    @Test
    void reactiveModeLabelIsCorrect() {
        assertEquals("reactive", HelloMode.REACTIVE.label());
    }

    @Test
    void reactiveModeEndpointTagIsCorrect() {
        assertEquals("/hello/reactive", HelloMode.REACTIVE.endpointTag());
    }

    @Test
    void reactiveModeResponsePrefixIsCorrect() {
        assertNotNull(HelloMode.REACTIVE.responsePrefix());
        assertEquals("Hello from Pekko reactive REST ", HelloMode.REACTIVE.responsePrefix());
    }
}