package io.github.georgecodes.benchmarking.javalin.web;

import io.github.georgecodes.benchmarking.javalin.config.ServiceConfig;
import io.github.georgecodes.benchmarking.javalin.config.ServiceConfig.HandlerExecutionMode;
import io.github.georgecodes.benchmarking.javalin.config.ServiceConfig.ThreadMode;
import io.github.georgecodes.benchmarking.javalin.domain.HelloService;
import io.github.georgecodes.benchmarking.javalin.infra.CacheProvider;
import io.javalin.Javalin;
import io.javalin.config.JavalinConfig;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.jspecify.annotations.NonNull;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Tests for {@link HelloRoutes} registration and execution paths.
 */
class HelloRoutesTest {

    private static final Consumer<JavalinConfig> NO_OP_CONFIG_CUSTOMIZER = ignored -> {
    };

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final List<ExecutorService> executorsToClose = new ArrayList<>();
    private SimpleMeterRegistry registry;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
    }

    @AfterEach
    void tearDown() {
        for (ExecutorService executor : executorsToClose) {
            shutdown(executor);
        }
        registry.close();
    }

    @Test
    void constructionPlatformMode() {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloRoutes routes = assertDoesNotThrow(
            () -> new HelloRoutes(config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT), newExecutor(), service, registry));

        assertNotNull(routes);
    }

    @Test
    void constructionVirtualMode() {
        HelloService service = new HelloService(CacheProvider.create(10));
        HelloRoutes routes = assertDoesNotThrow(
            () -> new HelloRoutes(config(ThreadMode.VIRTUAL, HandlerExecutionMode.DIRECT), newExecutor(), service, registry));

        assertNotNull(routes);
    }

    @Test
    void rejectsNullConfig() {
        HelloService service = new HelloService(CacheProvider.create(10));

        assertThrows(NullPointerException.class, () -> new HelloRoutes(null, newExecutor(), service, registry));
    }

    @Test
    void rejectsNullExecutor() {
        HelloService service = new HelloService(CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT), null, service, registry));
    }

    @Test
    void rejectsNullHelloService() {
        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT), newExecutor(), null, registry));
    }

    @Test
    void rejectsNullMeterRegistry() {
        HelloService service = new HelloService(CacheProvider.create(10));

        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT), newExecutor(), service, null));
    }

    @Test
    void registerRejectsNullRoutes() {
        HelloRoutes routes = new HelloRoutes(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        assertThrows(NullPointerException.class, () -> routes.register(null));
    }

    @Test
    void readyEndpointReturnsUp() throws Exception {
        Javalin app = startApp(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        try {
            HttpResponse<String> response = get(app, "/ready");

            assertEquals(200, response.statusCode());
            assertEquals("UP", response.body());
        } finally {
            app.stop();
        }
    }

    @Test
    void platformEndpointReturnsResponseAndIncrementsCounter() throws Exception {
        MeterRegistry meterRegistry = new SimpleMeterRegistry();
        Javalin app = startApp(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            meterRegistry
        );

        try {
            HttpResponse<String> response = get(app, "/hello/platform?log=true&sleep=0");

            assertEquals(200, response.statusCode());
            assertEquals("Hello from Javalin platform REST value-1", response.body());
            Counter counter = meterRegistry.find("hello.request.count")
                .tag("endpoint", "/hello/platform")
                .counter();
            assertNotNull(counter);
            assertEquals(1.0, counter.count());
        } finally {
            app.stop();
            meterRegistry.close();
        }
    }

    @Test
    void virtualEndpointReturnsResponseAndIncrementsCounter() throws Exception {
        MeterRegistry meterRegistry = new SimpleMeterRegistry();
        Javalin app = startApp(
            config(ThreadMode.VIRTUAL, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            meterRegistry
        );

        try {
            HttpResponse<String> response = get(app, "/hello/virtual");

            assertEquals(200, response.statusCode());
            assertEquals("Hello from Javalin virtual REST value-1", response.body());
            Counter counter = meterRegistry.find("hello.request.count")
                .tag("endpoint", "/hello/virtual")
                .counter();
            assertNotNull(counter);
            assertEquals(1.0, counter.count());
        } finally {
            app.stop();
            meterRegistry.close();
        }
    }

    @Test
    void inactiveEndpointReturnsNotFound() throws Exception {
        Javalin app = startApp(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        try {
            HttpResponse<String> response = get(app, "/hello/virtual");

            assertEquals(404, response.statusCode());
        } finally {
            app.stop();
        }
    }

    @Test
    void offloadEndpointUsesExecutor() throws Exception {
        Javalin app = startApp(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.OFFLOAD),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        try {
            HttpResponse<String> response = get(app, "/hello/platform?log=true&sleep=%200%20");

            assertEquals(200, response.statusCode());
            assertEquals("Hello from Javalin platform REST value-1", response.body());
        } finally {
            app.stop();
        }
    }

    @Test
    void offloadEndpointPropagatesExceptionCauseAsServerError() throws Exception {
        Javalin app = startApp(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.OFFLOAD),
            new FailingExecutorService(new InterruptedException("boom")),
            new HelloService(CacheProvider.create(10)),
            registry,
            jc -> jc.router.handlerWrapper(endpoint -> ctx -> {
                try {
                    endpoint.handler.handle(ctx);
                } catch (InterruptedException e) {
                    ctx.status(500);
                }
            })
        );

        try {
            HttpResponse<String> response = get(app, "/hello/platform");

            assertEquals(500, response.statusCode());
        } finally {
            app.stop();
        }
    }

    @Test
    void parseHelpersHandleCommonInputs() throws Exception {
        assertEquals(0, invokeParseInt(null));
        assertEquals(0, invokeParseInt("   "));
        assertEquals(7, invokeParseInt(" 7 "));
        assertTrue(invokeParseBoolean("true"));
        assertFalse(invokeParseBoolean(null));
    }

    @Test
    void submitAndJoinRethrowsExecutionExceptionWhenCauseIsNotException() {
        HelloRoutes routes = new HelloRoutes(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.OFFLOAD),
            new FailingExecutorService(new AssertionError("boom")),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        InvocationTargetException thrown = assertThrows(
            InvocationTargetException.class,
            () -> invokeSubmitAndJoin(routes)
        );

        assertInstanceOf(ExecutionException.class, thrown.getCause());
    }

    private ServiceConfig config(ThreadMode threadMode, HandlerExecutionMode handlerExecutionMode) {
        return new ServiceConfig(8080, threadMode, 100, 0, 0, 10000, 60000L, handlerExecutionMode, 0);
    }

    private ExecutorService newExecutor() {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        executorsToClose.add(executor);
        return executor;
    }

    private Javalin startApp(
        ServiceConfig config,
        ExecutorService executor,
        HelloService helloService,
        MeterRegistry meterRegistry
    ) {
        return startApp(config, executor, helloService, meterRegistry, NO_OP_CONFIG_CUSTOMIZER);
    }

    private Javalin startApp(
        ServiceConfig config,
        ExecutorService executor,
        HelloService helloService,
        MeterRegistry meterRegistry,
        Consumer<JavalinConfig> configCustomizer
    ) {
        HelloRoutes routes = new HelloRoutes(config, executor, helloService, meterRegistry);
        Javalin app = Javalin.create(jc -> {
            configCustomizer.accept(jc);
            routes.register(jc.routes);
        });
        app.start(0);
        return app;
    }

    private HttpResponse<String> get(Javalin app, String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + app.port() + path))
            .GET()
            .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private int invokeParseInt(String value) throws Exception {
        Method method = HelloRoutes.class.getDeclaredMethod("parseInt", String.class);
        method.setAccessible(true);
        return (int) method.invoke(null, value);
    }

    private boolean invokeParseBoolean(String value) throws Exception {
        Method method = HelloRoutes.class.getDeclaredMethod("parseBoolean", String.class);
        method.setAccessible(true);
        return (boolean) method.invoke(null, value);
    }

    private void invokeSubmitAndJoin(HelloRoutes routes) throws Exception {
        Class<?> supplierType = Class.forName("io.github.georgecodes.benchmarking.javalin.web.HelloRoutes$ThrowingSupplier");
        Object supplier = Proxy.newProxyInstance(
            supplierType.getClassLoader(),
            new Class<?>[]{supplierType},
            new ConstantInvocationHandler()
        );
        Method method = HelloRoutes.class.getDeclaredMethod("submitAndJoin", supplierType);
        method.setAccessible(true);
        method.invoke(routes, supplier);
    }

    private void shutdown(ExecutorService executor) {
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

    private static final class FailingExecutorService extends AbstractExecutorService {
        private final Throwable failure;
        private boolean shutdown;

        private FailingExecutorService(Throwable failure) {
            this.failure = failure;
        }

        @Override
        public void shutdown() {
            shutdown = true;
        }

        @Override
        public @NonNull List<Runnable> shutdownNow() {
            shutdown = true;
            return List.of();
        }

        @Override
        public boolean isShutdown() {
            return shutdown;
        }

        @Override
        public boolean isTerminated() {
            return shutdown;
        }

        @Override
        public boolean awaitTermination(long timeout, @NonNull TimeUnit unit) {
            return true;
        }

        @Override
        public void execute(@NonNull Runnable command) {
            throw new UnsupportedOperationException("execute is not used in these tests");
        }

        @Override
        public <T> @NonNull Future<T> submit(@NonNull Callable<T> task) {
            return CompletableFuture.failedFuture(failure);
        }
    }

    private static final class ConstantInvocationHandler implements InvocationHandler {

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) {
            return switch (method.getName()) {
                case "get" -> "ignored";
                case "toString" -> "ConstantInvocationHandler";
                case "hashCode" -> System.identityHashCode(proxy);
                case "equals" -> proxy == args[0];
                default -> throw new UnsupportedOperationException("Unexpected method: " + method.getName());
            };
        }
    }
}