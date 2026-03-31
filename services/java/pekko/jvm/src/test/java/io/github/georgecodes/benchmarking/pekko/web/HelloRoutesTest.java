package io.github.georgecodes.benchmarking.pekko.web;

import com.github.benmanes.caffeine.cache.Cache;
import com.typesafe.config.Config;
import com.typesafe.config.ConfigFactory;
import io.github.georgecodes.benchmarking.pekko.domain.HelloMode;
import io.github.georgecodes.benchmarking.pekko.domain.HelloService;
import io.github.georgecodes.benchmarking.pekko.infra.CacheProvider;
import io.github.georgecodes.benchmarking.pekko.infra.MetricsProvider;
import org.apache.pekko.actor.ActorSystem;
import org.apache.pekko.http.javadsl.Http;
import org.apache.pekko.http.javadsl.ServerBinding;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit and integration tests for {@link HelloRoutes}.
 * Starts an embedded Pekko HTTP server on a random port for route-level assertions.
 */
class HelloRoutesTest {

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);

    private static ActorSystem system;
    private static HelloRoutes helloRoutes;
    private static ServerBinding binding;
    private static HttpClient httpClient;
    private static String baseUrl;

    @BeforeAll
    static void setUpAll() throws Exception {
        // pekko-http 1.3.0's reference.conf and pekko-actor 1.4.0's reference.conf
        // both declare pekko.version; classpath ordering in the unshaded test
        // classpath (especially inside Docker) can let the wrong value win.
        // Pinning the version here makes the test deterministic everywhere.
        Config config = ConfigFactory.parseString(
                "pekko.version = \"" + ActorSystem.Version() + "\"")
            .withFallback(ConfigFactory.load());
        system = ActorSystem.create("test-system", config);
        Cache<String, String> cache = CacheProvider.create(10);
        HelloService helloService = new HelloService(cache);
        MetricsProvider metricsProvider = MetricsProvider.create(HelloMode.REACTIVE.endpointTag());
        helloRoutes = new HelloRoutes(helloService, metricsProvider, system);

        // Bind to port 0 — the OS assigns a random free port
        binding = Http.get(system)
            .newServerAt("127.0.0.1", 0)
            .bind(helloRoutes.routes())
            .toCompletableFuture()
            .get(10, TimeUnit.SECONDS);

        int port = binding.localAddress().getPort();
        baseUrl = "http://127.0.0.1:" + port;
        httpClient = HttpClient.newBuilder()
            .connectTimeout(REQUEST_TIMEOUT)
            .build();
    }

    @AfterAll
    static void tearDownAll() throws Exception {
        if (binding != null) {
            binding.unbind().toCompletableFuture().get(10, TimeUnit.SECONDS);
        }
        if (system != null) {
            system.terminate();
            system.getWhenTerminated().toCompletableFuture().get(10, TimeUnit.SECONDS);
        }
    }

    // ---- Construction tests ----

    @Test
    void constructionSucceeds() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");

        HelloRoutes routes = assertDoesNotThrow(
            () -> new HelloRoutes(service, metrics, system));
        assertNotNull(routes);
    }

    @Test
    void rejectsNullHelloService() {
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");
        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(null, metrics, system));
    }

    @Test
    void rejectsNullMetricsProvider() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(service, null, system));
    }

    @Test
    void rejectsNullActorSystem() {
        Cache<String, String> cache = CacheProvider.create(5);
        HelloService service = new HelloService(cache);
        MetricsProvider metrics = MetricsProvider.create("/hello/reactive");
        assertThrows(NullPointerException.class,
            () -> new HelloRoutes(service, metrics, null));
    }

    @Test
    void routesReturnsNonNull() {
        assertNotNull(helloRoutes.routes());
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
        assertEquals("\"Hello from Pekko reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithLogParam() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?log=true"))
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Pekko reactive REST value-1\"", response.body());
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
            .timeout(REQUEST_TIMEOUT)
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Pekko reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithInvalidSleep() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?sleep=notanumber"))
            .timeout(REQUEST_TIMEOUT)
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Pekko reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithEmptySleep() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?sleep="))
            .timeout(REQUEST_TIMEOUT)
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
    }

    @Test
    void helloReactiveWithSleepOne() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?sleep=1"))
            .timeout(REQUEST_TIMEOUT)
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Pekko reactive REST value-1\"", response.body());
    }

    @Test
    void helloReactiveWithBothParams() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/hello/reactive?sleep=0&log=true"))
            .timeout(REQUEST_TIMEOUT)
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("\"Hello from Pekko reactive REST value-1\"", response.body());
    }

    @Test
    void unknownPathReturns404() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/unknown"))
            .timeout(REQUEST_TIMEOUT)
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(404, response.statusCode());
    }
}