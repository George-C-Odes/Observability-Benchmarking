package io.github.georgecodes.benchmarking.helidon.se;

import io.github.georgecodes.benchmarking.helidon.se.application.HelloService;
import io.github.georgecodes.benchmarking.helidon.se.infra.ObservabilityFeatureFactory;
import io.github.georgecodes.benchmarking.helidon.se.infra.cache.CaffeineCacheAdapter;
import io.github.georgecodes.benchmarking.helidon.se.infra.metrics.MicrometerMetricsAdapter;
import io.github.georgecodes.benchmarking.helidon.se.infra.time.ThreadSleepAdapter;
import io.github.georgecodes.benchmarking.helidon.se.web.HelloRouting;
import io.helidon.http.Status;
import io.helidon.webclient.http1.Http1Client;
import io.helidon.webclient.http1.Http1ClientResponse;
import io.helidon.webserver.WebServer;
import io.helidon.webserver.observe.ObserveFeature;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HelloRoutingTest {

    private static WebServer server;
    private static Http1Client client;

    @BeforeAll
    static void startServer() {
        var cachePort = new CaffeineCacheAdapter(100);
        var metricsPort = new MicrometerMetricsAdapter();
        var sleepPort = new ThreadSleepAdapter();
        var helloService = new HelloService(cachePort, metricsPort, sleepPort);

        ObserveFeature observe = ObservabilityFeatureFactory.create("helidon-se-jvm-test");

        server = WebServer.builder()
                .port(0)
                .addFeature(observe)
                .routing(routing -> HelloRouting.register(routing, helloService))
                .build()
                .start();

        client = Http1Client.builder()
                .baseUri("http://localhost:" + server.port())
                .build();
    }

    @AfterAll
    static void stopServer() {
        if (server != null) {
            server.stop();
        }
    }

    @Test
    void virtualEndpoint() {
        try (Http1ClientResponse response = client.get("/hello/virtual").request()) {
            assertEquals(Status.OK_200, response.status());
            String body = response.as(String.class);
            assertTrue(body.contains("Hello from Helidon SE virtual REST"),
                    "Expected body to contain 'Hello from Helidon SE virtual REST' but was: " + body);
        }
    }

    @Test
    void virtualEndpointWithSleep() {
        try (Http1ClientResponse response = client.get("/hello/virtual")
                .queryParam("sleep", "0")
                .request()) {
            assertEquals(Status.OK_200, response.status());
            String body = response.as(String.class);
            assertTrue(body.contains("Hello from Helidon SE virtual REST"));
        }
    }

    @Test
    void healthEndpoint() {
        try (Http1ClientResponse response = client.get("/observe/health").request()) {
            // Helidon returns 204 No Content when all checks are UP and no body is needed
            assertTrue(
                    response.status() == Status.OK_200 || response.status() == Status.NO_CONTENT_204,
                    "Expected 200 or 204 but was: " + response.status());
        }
    }
}