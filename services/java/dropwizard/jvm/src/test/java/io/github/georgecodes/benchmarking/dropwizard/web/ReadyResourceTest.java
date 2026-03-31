package io.github.georgecodes.benchmarking.dropwizard.web;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Unit tests for {@link ReadyResource}.
 */
class ReadyResourceTest {

    @Test
    void readyReturnsUp() {
        ReadyResource resource = new ReadyResource();
        String result = resource.ready();
        assertNotNull(result);
        assertEquals("UP", result);
    }

    @Test
    void canBeInstantiated() {
        ReadyResource resource = new ReadyResource();
        assertNotNull(resource);
    }
}