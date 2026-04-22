package io.github.georgecodes.benchmarking.quarkus.application.port;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

class HelloModeTest {

    @Test
    void eachModeExposesStableLabelsEndpointTagsAndResponsePrefixes() {
        assertAll(
            () -> assertMode(HelloMode.PLATFORM, "platform", "/hello/platform", "Hello from Quarkus platform REST "),
            () -> assertMode(HelloMode.VIRTUAL, "virtual", "/hello/virtual", "Hello from Quarkus virtual REST "),
            () -> assertMode(HelloMode.REACTIVE, "reactive", "/hello/reactive", "Hello from Quarkus reactive REST ")
        );
    }

    private static void assertMode(HelloMode mode, String label, String endpointTag, String responsePrefix) {
        assertEquals(label, mode.label());
        assertEquals(endpointTag, mode.endpointTag());
        assertEquals(responsePrefix, mode.responsePrefix());
    }
}

