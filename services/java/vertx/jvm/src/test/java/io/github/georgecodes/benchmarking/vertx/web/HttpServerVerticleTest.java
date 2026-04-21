package io.github.georgecodes.benchmarking.vertx.web;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
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
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration tests for {@link HttpServerVerticle}.
 * Deploys the verticle on a random port and validates end-to-end behavior.
 */
class HttpServerVerticleTest {

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);

    private static Vertx vertx;
    private static HttpClient httpClient;
    private static String baseUrl;

    @BeforeAll
    static void setUpAll() throws Exception {
        vertx = Vertx.vertx();
        Cache<String, String> cache = CacheProvider.create(10);
        HelloService helloService = new HelloService(cache);
        MetricsProvider metricsProvider = MetricsProvider.create(HelloMode.REACTIVE.endpointTag());

        // Bind to port 0 — the OS assigns a random free port, no race possible
        HttpServerOptions serverOptions = new HttpServerOptions()
            .setHost("127.0.0.1")
            .setPort(0);

        HttpServerVerticle verticle = new HttpServerVerticle(
            0, helloService, metricsProvider, serverOptions);

        vertx.deployVerticle(verticle)
            .toCompletionStage()
            .toCompletableFuture()
            .get(10, TimeUnit.SECONDS);

        assertTrue(verticle.actualPort() > 0, "Server should bind to a valid port");
        baseUrl = "http://127.0.0.1:" + verticle.actualPort();
        httpClient = HttpClient.newBuilder()
            .connectTimeout(REQUEST_TIMEOUT)
            .build();
    }

    @AfterAll
    static void tearDownAll() throws Exception {
        if (vertx != null) {
            vertx.close()
                .toCompletionStage()
                .toCompletableFuture()
                .get(10, TimeUnit.SECONDS);
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

    @Test
    void actualPortIsZeroBeforeStart() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");
        HttpServerVerticle verticle = new HttpServerVerticle(8080, service, metrics, new HttpServerOptions());

        assertEquals(0, verticle.actualPort());
    }

    // ---- Endpoint tests via deployed verticle ----

    @Test
    void readyEndpointReturnsUp() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/ready"))
            .timeout(REQUEST_TIMEOUT)
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
            .timeout(REQUEST_TIMEOUT)
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
            .timeout(REQUEST_TIMEOUT)
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
    }

    @Test
    void deploymentFailsWhenPortIsAlreadyInUse() throws Exception {
        var occupyingServer = vertx.createHttpServer(new HttpServerOptions().setHost("127.0.0.1"))
            .requestHandler(_ -> {
            })
            .listen(0)
            .toCompletionStage()
            .toCompletableFuture()
            .get(10, TimeUnit.SECONDS);

        int occupiedPort = occupyingServer.actualPort();
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        MetricsProvider metrics = MetricsProvider.create(HelloMode.REACTIVE.endpointTag());
        HttpServerOptions serverOptions = new HttpServerOptions()
            .setHost("127.0.0.1")
            .setPort(occupiedPort);
        HttpServerVerticle verticle = new HttpServerVerticle(occupiedPort, service, metrics, serverOptions);
        Logger logger = (Logger) LoggerFactory.getLogger(HttpServerVerticle.class);
        Level previousLevel = logger.getLevel();

        try {
            logger.setLevel(Level.OFF);

            ExecutionException exception = assertThrows(ExecutionException.class, () -> vertx.deployVerticle(verticle)
                .toCompletionStage()
                .toCompletableFuture()
                .get(10, TimeUnit.SECONDS));

            assertEquals(0, verticle.actualPort());
            assertNotNull(exception.getCause(), "Deployment should fail with an underlying cause");
        } finally {
            logger.setLevel(previousLevel);
            occupyingServer.close()
                .toCompletionStage()
                .toCompletableFuture()
                .get(10, TimeUnit.SECONDS);
        }
    }
}