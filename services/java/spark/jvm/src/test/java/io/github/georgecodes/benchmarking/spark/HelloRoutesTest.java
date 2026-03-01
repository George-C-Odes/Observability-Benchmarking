package io.github.georgecodes.benchmarking.spark;

import io.github.georgecodes.benchmarking.spark.config.ServiceConfig;
import io.github.georgecodes.benchmarking.spark.domain.HelloService;
import io.github.georgecodes.benchmarking.spark.web.HelloRoutes;
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
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Unit tests for {@link HelloRoutes} construction and wiring.
 * Spark keeps a singleton server, so we avoid calling {@code register()} in unit tests.
 */
class HelloRoutesTest {

    private final MeterRegistry registry = new SimpleMeterRegistry();
    private final ExecutorService executor = Executors.newFixedThreadPool(1);

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
                assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS),
                    "ExecutorService did not terminate in time");
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            fail("Interrupted while shutting down ExecutorService", e);
        }
    }

    private ServiceConfig platformConfig() {
        return new ServiceConfig(
            8080,
            ServiceConfig.ThreadMode.PLATFORM,
            100,
            0, 0, 10000, 60000L,
            ServiceConfig.HandlerExecutionMode.DIRECT,
            0,
            ServiceConfig.VirtualExecutionMode.SPARK
        );
    }

    private ServiceConfig virtualConfig() {
        return new ServiceConfig(
            8080,
            ServiceConfig.ThreadMode.VIRTUAL,
            100,
            0, 0, 10000, 60000L,
            ServiceConfig.HandlerExecutionMode.DIRECT,
            0,
            ServiceConfig.VirtualExecutionMode.SPARK
        );
    }

    @Test
    void constructionPlatformMode() {
        HelloService service = new HelloService(
            io.github.georgecodes.benchmarking.spark.infra.CacheProvider.create(10));

        HelloRoutes routes = assertDoesNotThrow(
            () -> new HelloRoutes(platformConfig(), executor, service, registry));
        assertNotNull(routes);
    }

    @Test
    void constructionVirtualMode() {
        HelloService service = new HelloService(
            io.github.georgecodes.benchmarking.spark.infra.CacheProvider.create(10));

        HelloRoutes routes = assertDoesNotThrow(
            () -> new HelloRoutes(virtualConfig(), executor, service, registry));
        assertNotNull(routes);
    }

    @Test
    void counterRegisteredInPlatformMode() {
        HelloService service = new HelloService(
            io.github.georgecodes.benchmarking.spark.infra.CacheProvider.create(10));

        new HelloRoutes(platformConfig(), executor, service, registry);

        assertNotNull(registry.find("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .counter(), "Counter for /hello/platform should be registered");
    }

    @Test
    void counterRegisteredInVirtualMode() {
        MeterRegistry reg = new SimpleMeterRegistry();
        HelloService service = new HelloService(
            io.github.georgecodes.benchmarking.spark.infra.CacheProvider.create(10));

        new HelloRoutes(virtualConfig(), executor, service, reg);

        assertNotNull(reg.find("hello.request.count")
            .tag("endpoint", "/hello/virtual")
            .counter(), "Counter for /hello/virtual should be registered");
    }

    @Test
    void rejectsNullConfig() {
        HelloService service = new HelloService(
            io.github.georgecodes.benchmarking.spark.infra.CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(null, executor, service, registry));
    }

    @Test
    void rejectsNullExecutor() {
        HelloService service = new HelloService(
            io.github.georgecodes.benchmarking.spark.infra.CacheProvider.create(10));

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
        HelloService service = new HelloService(
            io.github.georgecodes.benchmarking.spark.infra.CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(platformConfig(), executor, service, null));
    }
}