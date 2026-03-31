package io.github.georgecodes.benchmarking.vertx.web;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.vertx.domain.HelloMode;
import io.github.georgecodes.benchmarking.vertx.domain.HelloService;
import io.github.georgecodes.benchmarking.vertx.infra.CacheProvider;
import io.github.georgecodes.benchmarking.vertx.infra.MetricsProvider;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServerOptions;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Integration tests for {@link HttpServerVerticle}.
 * Deploys the verticle on a random port and validates end-to-end behaviour.
 */
class HttpServerVerticleTest {

    private static Vertx vertx;
    private static HttpClient httpClient;
    private static String baseUrl;

    @BeforeAll
    static void setUpAll() throws Exception {
        vertx = Vertx.vertx();
        Cache<String, String> cache = CacheProvider.create(10);
        HelloService helloService = new HelloService(cache);
        MetricsProvider metricsProvider = MetricsProvider.create(HelloMode.REACTIVE.endpointTag());

        int testPort = findFreePort();
        HttpServerOptions serverOptions = new HttpServerOptions()
            .setHost("127.0.0.1")
            .setPort(testPort);

        HttpServerVerticle verticle = new HttpServerVerticle(
            testPort, helloService, metricsProvider, serverOptions);

        vertx.deployVerticle(verticle)
            .toCompletionStage()
            .toCompletableFuture()
            .get(10, TimeUnit.SECONDS);
        baseUrl = "http://127.0.0.1:" + testPort;
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

    private static int findFreePort() throws Exception {
        try (var socket = new java.net.ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    // ---- Constructor null-check tests ----

    @Test
    void rejectsNullHelloService() {
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");
        HttpServerOptions opts = new HttpServerOptions();
        assertThrows(NullPointerException.class,
            () -> new HttpServerVerticle(8080, null, metrics, opts));
    }

    @Test
    void rejectsNullMetricsProvider() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        HttpServerOptions opts = new HttpServerOptions();
        assertThrows(NullPointerException.class,
            () -> new HttpServerVerticle(8080, service, null, opts));
    }

    @Test
    void rejectsNullServerOptions() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");
        assertThrows(NullPointerException.class,
            () -> new HttpServerVerticle(8080, service, metrics, null));
    }

    // ---- Endpoint tests via deployed verticle ----

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
        assertEquals("\"Hello from Vertx reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithLogParam() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?log=true"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
    }
}