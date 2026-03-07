package io.github.georgecodes.benchmarking.dropwizard;

import io.github.georgecodes.benchmarking.dropwizard.config.ServiceConfig;
import io.github.georgecodes.benchmarking.dropwizard.domain.HelloService;
import io.github.georgecodes.benchmarking.dropwizard.infra.CacheProvider;
import io.github.georgecodes.benchmarking.dropwizard.web.HelloResource;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Unit tests for {@link HelloResource} construction and wiring.
 */
class HelloResourceTest {

    private final MeterRegistry registry = new SimpleMeterRegistry();

    private ServiceConfig platformConfig() {
        return new ServiceConfig(
            8080,
            ServiceConfig.ThreadMode.PLATFORM,
            100,
            0, 0, 10000, 60000L
        );
    }

    private ServiceConfig virtualConfig() {
        return new ServiceConfig(
            8080,
            ServiceConfig.ThreadMode.VIRTUAL,
            100,
            0, 0, 10000, 60000L
        );
    }

    @Test
    void constructionPlatformMode() {
        HelloService service = new HelloService(CacheProvider.create(10));

        HelloResource resource = assertDoesNotThrow(
            () -> new HelloResource(platformConfig(), service, registry));
        assertNotNull(resource);
    }

    @Test
    void constructionVirtualMode() {
        HelloService service = new HelloService(CacheProvider.create(10));

        HelloResource resource = assertDoesNotThrow(
            () -> new HelloResource(virtualConfig(), service, registry));
        assertNotNull(resource);
    }

    @Test
    void counterRegisteredInPlatformMode() {
        HelloService service = new HelloService(CacheProvider.create(10));

        new HelloResource(platformConfig(), service, registry);

        assertNotNull(registry.find("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .counter(), "Counter for /hello/platform should be registered");
    }

    @Test
    void counterRegisteredInVirtualMode() {
        MeterRegistry reg = new SimpleMeterRegistry();
        HelloService service = new HelloService(CacheProvider.create(10));

        new HelloResource(virtualConfig(), service, reg);

        assertNotNull(reg.find("hello.request.count")
            .tag("endpoint", "/hello/virtual")
            .counter(), "Counter for /hello/virtual should be registered");
    }

    @Test
    void rejectsNullConfig() {
        HelloService service = new HelloService(CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloResource(null, service, registry));
    }

    @Test
    void rejectsNullHelloService() {
        assertThrows(NullPointerException.class,
            () -> new HelloResource(platformConfig(), null, registry));
    }

    @Test
    void rejectsNullMeterRegistry() {
        HelloService service = new HelloService(CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloResource(platformConfig(), service, null));
    }
}