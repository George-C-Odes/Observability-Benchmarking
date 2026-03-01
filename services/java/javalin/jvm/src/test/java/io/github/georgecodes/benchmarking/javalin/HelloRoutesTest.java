package io.github.georgecodes.benchmarking.javalin;

import io.github.georgecodes.benchmarking.javalin.config.ServiceConfig;
import io.github.georgecodes.benchmarking.javalin.domain.HelloService;
import io.github.georgecodes.benchmarking.javalin.infra.CacheProvider;
import io.github.georgecodes.benchmarking.javalin.web.HelloRoutes;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Unit tests for {@link HelloRoutes} construction and wiring.
 * Javalin requires a running server to actually register routes, so we test
 * constructor validation and metric registration only.
 */
class HelloRoutesTest {

    private final MeterRegistry registry = new SimpleMeterRegistry();
    private final ExecutorService executor = Executors.newFixedThreadPool(1);

    @AfterEach
    void tearDown() throws InterruptedException {
        executor.shutdownNow();
        executor.awaitTermination(5, TimeUnit.SECONDS);
    }

    private ServiceConfig platformConfig() {
        return new ServiceConfig(
            8080,
            ServiceConfig.ThreadMode.PLATFORM,
            100,
            0, 0, 10000, 60000L,
            ServiceConfig.HandlerExecutionMode.DIRECT,
            0
        );
    }

    private ServiceConfig virtualConfig() {
        return new ServiceConfig(
            8080,
            ServiceConfig.ThreadMode.VIRTUAL,
            100,
            0, 0, 10000, 60000L,
            ServiceConfig.HandlerExecutionMode.DIRECT,
            0
        );
    }

    @Test
    void constructionPlatformMode() {
        HelloService service = new HelloService(CacheProvider.create(10));

        HelloRoutes routes = assertDoesNotThrow(
            () -> new HelloRoutes(platformConfig(), executor, service, registry));
        assertNotNull(routes);
    }

    @Test
    void constructionVirtualMode() {
        HelloService service = new HelloService(CacheProvider.create(10));

        HelloRoutes routes = assertDoesNotThrow(
            () -> new HelloRoutes(virtualConfig(), executor, service, registry));
        assertNotNull(routes);
    }

    @Test
    void counterRegisteredInPlatformMode() {
        HelloService service = new HelloService(CacheProvider.create(10));

        new HelloRoutes(platformConfig(), executor, service, registry);

        assertNotNull(registry.find("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .counter(), "Counter for /hello/platform should be registered");
    }

    @Test
    void counterRegisteredInVirtualMode() {
        MeterRegistry reg = new SimpleMeterRegistry();
        HelloService service = new HelloService(CacheProvider.create(10));

        new HelloRoutes(virtualConfig(), executor, service, reg);

        assertNotNull(reg.find("hello.request.count")
            .tag("endpoint", "/hello/virtual")
            .counter(), "Counter for /hello/virtual should be registered");
    }

    @Test
    void rejectsNullConfig() {
        HelloService service = new HelloService(CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(null, executor, service, registry));
    }

    @Test
    void rejectsNullExecutor() {
        HelloService service = new HelloService(CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(platformConfig(), null, service, registry));
    }

    @Test
    void rejectsNullHelloService() {
        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(platformConfig(), executor, null, registry));
    }

    @Test
    void rejectsNullMeterRegistry() {
        HelloService service = new HelloService(CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(platformConfig(), executor, service, null));
    }
}

