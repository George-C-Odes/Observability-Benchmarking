package io.github.georgecodes.benchmarking.dropwizard.web;

import io.github.georgecodes.benchmarking.dropwizard.config.ServiceConfig;
import io.github.georgecodes.benchmarking.dropwizard.config.ServiceConfig.ThreadMode;
import io.github.georgecodes.benchmarking.dropwizard.domain.HelloService;
import io.github.georgecodes.benchmarking.dropwizard.infra.CacheProvider;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link HelloResource} construction, wiring, and request handling.
 */
class HelloResourceTest {

    private final MeterRegistry registry = new SimpleMeterRegistry();

    private ServiceConfig platformConfig() {
        return new ServiceConfig(
            8080,
            ThreadMode.PLATFORM,
            100,
            0, 0, 10000, 60000L
        );
    }

    private ServiceConfig virtualConfig() {
        return new ServiceConfig(
            8080,
            ThreadMode.VIRTUAL,
            100,
            0, 0, 10000, 60000L
        );
    }

    // ── Construction tests ──────────────────────────────────────────────

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

    // ── Counter registration tests ──────────────────────────────────────

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

    // ── helloPlatform endpoint tests ────────────────────────────────────

    @Test
    void helloPlatformReturnsOkInPlatformMode() throws InterruptedException {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(platformConfig(), service, registry);

        try (Response response = resource.helloPlatform(0, false)) {
            assertEquals(200, response.getStatus());
            assertNotNull(response.getEntity());
            assertTrue(response.getEntity().toString().contains("Hello from Dropwizard platform REST "));
        }
    }

    @Test
    void helloPlatformReturnsErrorInVirtualMode() throws InterruptedException {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(virtualConfig(), service, registry);

        try (Response response = resource.helloPlatform(0, false)) {
            assertEquals(500, response.getStatus());
        }
    }

    @Test
    void helloPlatformIncrementsCounter() throws InterruptedException {
        MeterRegistry reg = new SimpleMeterRegistry();
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(platformConfig(), service, reg);

        resource.helloPlatform(0, false).close();
        resource.helloPlatform(0, false).close();

        Counter counter = reg.find("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .counter();
        assertNotNull(counter);
        assertEquals(2.0, counter.count(), "Counter should reflect 2 increments");
    }

    @Test
    void helloPlatformWithLogDoesNotThrow() throws InterruptedException {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(platformConfig(), service, registry);

        try (Response response = resource.helloPlatform(0, true)) {
            assertEquals(200, response.getStatus());
        }
    }

    @Test
    void helloPlatformWithSleepDelays() throws InterruptedException {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(platformConfig(), service, registry);

        long start = System.nanoTime();
        try (Response response = resource.helloPlatform(1, false)) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            assertEquals(200, response.getStatus());
            assertTrue(elapsedMs >= 900, "Expected at least ~1s delay, got " + elapsedMs + "ms");
        }
    }

    // ── helloVirtual endpoint tests ─────────────────────────────────────

    @Test
    void helloVirtualReturnsOkInVirtualMode() throws InterruptedException {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(virtualConfig(), service, registry);

        try (Response response = resource.helloVirtual(0, false)) {
            assertEquals(200, response.getStatus());
            assertNotNull(response.getEntity());
            assertTrue(response.getEntity().toString().contains("Hello from Dropwizard virtual REST "));
        }
    }

    @Test
    void helloVirtualReturnsErrorInPlatformMode() throws InterruptedException {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(platformConfig(), service, registry);

        try (Response response = resource.helloVirtual(0, false)) {
            assertEquals(500, response.getStatus());
        }
    }

    @Test
    void helloVirtualIncrementsCounter() throws InterruptedException {
        MeterRegistry reg = new SimpleMeterRegistry();
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(virtualConfig(), service, reg);

        resource.helloVirtual(0, false).close();
        resource.helloVirtual(0, false).close();
        resource.helloVirtual(0, false).close();

        Counter counter = reg.find("hello.request.count")
            .tag("endpoint", "/hello/virtual")
            .counter();
        assertNotNull(counter);
        assertEquals(3.0, counter.count(), "Counter should reflect 3 increments");
    }

    @Test
    void helloVirtualWithLogDoesNotThrow() throws InterruptedException {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloResource resource = new HelloResource(virtualConfig(), service, registry);

        try (Response response = resource.helloVirtual(0, true)) {
            assertEquals(200, response.getStatus());
        }
    }
}