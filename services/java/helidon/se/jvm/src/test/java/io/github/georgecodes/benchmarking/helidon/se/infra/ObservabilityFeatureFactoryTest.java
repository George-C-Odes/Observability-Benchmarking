package io.github.georgecodes.benchmarking.helidon.se.infra;

import io.helidon.config.Config;
import io.helidon.tracing.config.TracingConfig;
import io.helidon.webserver.observe.ObserveFeature;
import io.helidon.webserver.observe.spi.Observer;
import io.helidon.webserver.observe.tracing.TracingObserver;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

class ObservabilityFeatureFactoryTest {

    @Test
    void createsTracingObserverWithRouteBasedServerSpanName() {
        Config config = Config.create();
        TracingConfig tracingConfig = TracingConfig.create(config.get("tracing"));

        ObserveFeature observeFeature = ObservabilityFeatureFactory.create("helidon-se-jvm-test", config);

        Observer tracingObserver = observeFeature.prototype().observers().stream()
                .filter(observer -> observer instanceof TracingObserver)
                .findFirst()
                .orElseThrow(() -> new AssertionError("Expected a TracingObserver to be registered"));

        TracingObserver observer = assertInstanceOf(TracingObserver.class, tracingObserver);

        assertEquals(
                "%1$s %2$s",
                tracingConfig.spanConfig("web-server", "HTTP Request")
                        .newName()
                        .orElseThrow(() -> new AssertionError("Expected web-server span rename to be configured")));
    }
}