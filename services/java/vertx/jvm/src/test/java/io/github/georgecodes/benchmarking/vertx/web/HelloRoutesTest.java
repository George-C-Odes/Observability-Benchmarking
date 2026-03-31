package io.github.georgecodes.benchmarking.vertx.web;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.vertx.domain.HelloMode;
import io.github.georgecodes.benchmarking.vertx.domain.HelloService;
import io.github.georgecodes.benchmarking.vertx.infra.CacheProvider;
import io.github.georgecodes.benchmarking.vertx.infra.MetricsProvider;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit and integration tests for {@link HelloRoutes}.
 * Starts an embedded Vert.x HTTP server on a random port for route-level assertions.
 */
class HelloRoutesTest {

    private static Vertx vertx;
    private static HttpClient httpClient;
    private static String baseUrl;

    @BeforeAll
    static void setUpAll() throws Exception {
        vertx = Vertx.vertx();
        Cache<String, String> cache = CacheProvider.create(10);
        HelloService helloService = new HelloService(cache);
        MetricsProvider metricsProvider = MetricsProvider.create(HelloMode.REACTIVE.endpointTag());

        HelloRoutes helloRoutes = new HelloRoutes(helloService, metricsProvider);
        Router router = Router.router(vertx);
        helloRoutes.register(router, vertx);

        // Start HTTP server on port 0 (random free port)
        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger actualPort = new AtomicInteger();
        vertx.createHttpServer()
            .requestHandler(router)
            .listen(0)
            .onSuccess(server -> {
                actualPort.set(server.actualPort());
                latch.countDown();
            })
            .onFailure(_ -> latch.countDown());

        assertTrue(latch.await(10, TimeUnit.SECONDS), "Server should start within 10 seconds");
        assertTrue(actualPort.get() > 0, "Server should bind to a valid port");
        baseUrl = "http://127.0.0.1:" + actualPort.get();
        httpClient = HttpClient.newHttpClient();
    }

    @AfterAll
    static void tearDownAll() throws Exception {
        if (vertx != null) {
            CountDownLatch latch = new CountDownLatch(1);
            vertx.close().onComplete(_ -> latch.countDown());
            assertTrue(latch.await(10, TimeUnit.SECONDS), "Vert.x should close within 10 seconds");
        }
    }

    // ---- Construction tests ----

    @Test
    void constructionSucceeds() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");

        HelloRoutes routes = assertDoesNotThrow(() -> new HelloRoutes(service, metrics));
        assertNotNull(routes);
    }

    @Test
    void rejectsNullHelloService() {
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");
        assertThrows(NullPointerException.class, () -> new HelloRoutes(null, metrics));
    }

    @Test
    void rejectsNullMetricsProvider() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        assertThrows(NullPointerException.class, () -> new HelloRoutes(service, null));
    }

    @Test
    void registerRejectsNullRouter() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");
        HelloRoutes routes = new HelloRoutes(service, metrics);
        assertThrows(NullPointerException.class, () -> routes.register(null, vertx));
    }

    @Test
    void registerRejectsNullVertx() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");
        HelloRoutes routes = new HelloRoutes(service, metrics);
        Router router = Router.router(vertx);
        assertThrows(NullPointerException.class, () -> routes.register(router, null));
    }

    // ---- Route endpoint tests via real HTTP ----

    @Test
    void readyEndpointReturnsUp() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/ready"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("UP", response.body());
    }

    @Test
    void helloReactiveEndpointReturnsOk() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("content-type")
            .orElse("").contains("application/json"));
    }

    @Test
    void helloReactiveEndpointReturnsExpectedBody() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Vertx reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithLogParamTrue() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?log=true"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Vertx reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithLogParamFalse() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?log=false"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
    }

    @Test
    void helloReactiveWithSleepZero() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?sleep=0"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Vertx reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithSleepOne() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?sleep=1"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Vertx reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithBothParams() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?sleep=0&log=true"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Vertx reactive REST value-1\"", response.body());
    }

    @Test
    void unknownPathReturns404() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/unknown"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(404, response.statusCode());
    }
}