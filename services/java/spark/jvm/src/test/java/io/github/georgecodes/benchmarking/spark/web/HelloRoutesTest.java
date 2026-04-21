package io.github.georgecodes.benchmarking.spark.web;

import io.github.georgecodes.benchmarking.spark.config.ServiceConfig;
import io.github.georgecodes.benchmarking.spark.config.ServiceConfig.HandlerExecutionMode;
import io.github.georgecodes.benchmarking.spark.config.ServiceConfig.ThreadMode;
import io.github.georgecodes.benchmarking.spark.config.ServiceConfig.VirtualExecutionMode;
import io.github.georgecodes.benchmarking.spark.domain.HelloService;
import io.github.georgecodes.benchmarking.spark.infra.CacheProvider;
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
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static spark.Spark.awaitInitialization;
import static spark.Spark.awaitStop;
import static spark.Spark.init;
import static spark.Spark.ipAddress;
import static spark.Spark.port;
import static spark.Spark.stop;

/**
 * Tests for {@link HelloRoutes} construction and execution paths.
 */
class HelloRoutesTest {

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final List<ExecutorService> executorsToClose = new ArrayList<>();
    private SimpleMeterRegistry registry;
    private boolean serverStarted;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        serverStarted = false;
    }

    @AfterEach
    void tearDown() {
        if (serverStarted) {
            stop();
            awaitStop();
        }
        for (ExecutorService executor : executorsToClose) {
            shutdown(executor);
        }
        registry.close();
    }

    private ServiceConfig config(
        ThreadMode threadMode,
        HandlerExecutionMode handlerExecutionMode,
        VirtualExecutionMode virtualExecutionMode
    ) {
        return new ServiceConfig(
            8080,
            threadMode,
            100,
            0, 0, 10000, 60000L,
            handlerExecutionMode,
            0,
            virtualExecutionMode
        );
    }

    private ServiceConfig config(ThreadMode threadMode, HandlerExecutionMode handlerExecutionMode) {
        return config(threadMode, handlerExecutionMode, VirtualExecutionMode.SPARK);
    }

    private ExecutorService newExecutor() {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        executorsToClose.add(executor);
        return executor;
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

        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(null, newExecutor(), service, registry));
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
    void counterRegisteredInPlatformMode() {
        HelloService service = new HelloService(CacheProvider.create(10));

        new HelloRoutes(config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT), newExecutor(), service, registry);

        assertNotNull(registry.find("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .counter(), "Counter for /hello/platform should be registered");
    }

    @Test
    void counterRegisteredInVirtualMode() {
        MeterRegistry reg = new SimpleMeterRegistry();
        HelloService service = new HelloService(CacheProvider.create(10));

        new HelloRoutes(config(ThreadMode.VIRTUAL, HandlerExecutionMode.DIRECT), newExecutor(), service, reg);

        assertNotNull(reg.find("hello.request.count")
            .tag("endpoint", "/hello/virtual")
            .counter(), "Counter for /hello/virtual should be registered");

        reg.close();
    }

    @Test
    void counterStartsAtZeroOnConstruction() {
        MeterRegistry reg = new SimpleMeterRegistry();
        HelloService service = new HelloService(CacheProvider.create(10));

        new HelloRoutes(config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT), newExecutor(), service, reg);

        Counter counter = reg.find("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .counter();
        assertNotNull(counter, "Counter should be registered");
        assertEquals(0.0, counter.count(), "Counter should be 0 after construction (no requests yet)");

        reg.close();
    }

    @Test
    void readyEndpointReturnsUp() throws Exception {
        int sparkPort = startRoutes(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        HttpResponse<String> response = get(sparkPort, "/ready");

        assertEquals(200, response.statusCode());
        assertEquals("UP", response.body());
    }

    @Test
    void platformEndpointReturnsResponseAndIncrementsCounter() throws Exception {
        MeterRegistry meterRegistry = new SimpleMeterRegistry();
        int sparkPort = startRoutes(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            meterRegistry
        );

        HttpResponse<String> response = get(sparkPort, "/hello/platform?log=true&sleep=0");

        assertEquals(200, response.statusCode());
        assertEquals("Hello from Spark platform REST value-1", response.body());
        Counter counter = meterRegistry.find("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .counter();
        assertNotNull(counter);
        assertEquals(1.0, counter.count());

        meterRegistry.close();
    }

    @Test
    void virtualEndpointReturnsResponseAndIncrementsCounter() throws Exception {
        MeterRegistry meterRegistry = new SimpleMeterRegistry();
        int sparkPort = startRoutes(
            config(ThreadMode.VIRTUAL, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            meterRegistry
        );

        HttpResponse<String> response = get(sparkPort, "/hello/virtual");

        assertEquals(200, response.statusCode());
        assertEquals("Hello from Spark virtual REST value-1", response.body());
        Counter counter = meterRegistry.find("hello.request.count")
            .tag("endpoint", "/hello/virtual")
            .counter();
        assertNotNull(counter);
        assertEquals(1.0, counter.count());

        meterRegistry.close();
    }

    @Test
    void inactiveEndpointReturnsNotFound() throws Exception {
        int sparkPort = startRoutes(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.DIRECT),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        HttpResponse<String> response = get(sparkPort, "/hello/virtual");

        assertEquals(404, response.statusCode());
    }

    @Test
    void platformOffloadEndpointUsesExecutor() throws Exception {
        int sparkPort = startRoutes(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.OFFLOAD),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        HttpResponse<String> response = get(sparkPort, "/hello/platform?log=true&sleep=%200%20");

        assertEquals(200, response.statusCode());
        assertEquals("Hello from Spark platform REST value-1", response.body());
    }

    @Test
    void virtualOffloadEndpointUsesExecutorWhenConfigured() throws Exception {
        int sparkPort = startRoutes(
            config(ThreadMode.VIRTUAL, HandlerExecutionMode.DIRECT, VirtualExecutionMode.OFFLOAD),
            newExecutor(),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        HttpResponse<String> response = get(sparkPort, "/hello/virtual?log=true&sleep=%20%20");

        assertEquals(200, response.statusCode());
        assertEquals("Hello from Spark virtual REST value-1", response.body());
    }

    @Test
    void parseIntRejectsInvalidNumbers() {
        InvocationTargetException thrown = assertThrows(
            InvocationTargetException.class,
            () -> invokeParseInt("abc")
        );

        assertInstanceOf(NumberFormatException.class, thrown.getCause());
    }

    @Test
    void parseIntHandlesCommonInputs() throws Exception {
        assertEquals(0, invokeParseInt(null));
        assertEquals(0, invokeParseInt("   "));
        assertEquals(7, invokeParseInt(" 7 "));
    }

    @Test
    void submitAndJoinUnwrapsExceptionCause() {
        HelloRoutes routes = new HelloRoutes(
            config(ThreadMode.PLATFORM, HandlerExecutionMode.OFFLOAD),
            new FailingExecutorService(new InterruptedException("boom")),
            new HelloService(CacheProvider.create(10)),
            registry
        );

        InvocationTargetException thrown = assertThrows(
            InvocationTargetException.class,
            () -> invokeSubmitAndJoin(routes)
        );

        assertInstanceOf(InterruptedException.class, thrown.getCause());
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

        assertInstanceOf(java.util.concurrent.ExecutionException.class, thrown.getCause());
    }

    private int startRoutes(
        ServiceConfig config,
        ExecutorService executor,
        HelloService helloService,
        MeterRegistry meterRegistry
    ) throws Exception {
        int sparkPort = findFreePort();
        ipAddress("127.0.0.1");
        port(sparkPort);
        new HelloRoutes(config, executor, helloService, meterRegistry).register();
        init();
        awaitInitialization();
        serverStarted = true;
        return sparkPort;
    }

    private HttpResponse<String> get(int sparkPort, String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + sparkPort + path))
            .GET()
            .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private int findFreePort() throws Exception {
        try (ServerSocket serverSocket = new ServerSocket(0)) {
            return serverSocket.getLocalPort();
        }
    }

    private int invokeParseInt(String value) throws Exception {
        Method method = HelloRoutes.class.getDeclaredMethod("parseInt", String.class);
        method.setAccessible(true);
        return (int) method.invoke(null, value);
    }

    private void invokeSubmitAndJoin(HelloRoutes routes) throws Exception {
        Class<?> supplierType = Class.forName("io.github.georgecodes.benchmarking.spark.web.HelloRoutes$ThrowingSupplier");
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