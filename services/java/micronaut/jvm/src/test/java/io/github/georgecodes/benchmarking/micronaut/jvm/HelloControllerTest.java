package io.github.georgecodes.benchmarking.micronaut.jvm;

import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

@MicronautTest
class HelloControllerTest {

    @Inject
    @Client("/")
    HttpClient client;

    @Test
    void platformEndpoint() {
        String body = client.toBlocking().retrieve(HttpRequest.GET("/hello/platform"));
        assertTrue(body.contains("Hello from Micronaut platform REST"));
    }

    @Test
    void virtualEndpoint() {
        String body = client.toBlocking().retrieve(HttpRequest.GET("/hello/virtual"));
        assertTrue(body.contains("Hello from Micronaut virtual REST"));
    }

    @Test
    void reactiveEndpoint() {
        String body = client.toBlocking().retrieve(HttpRequest.GET("/hello/reactive"));
        assertTrue(body.contains("Hello from Micronaut reactive REST"));
    }

    @Test
    void healthEndpoint() {
        HttpRequest<?> req = HttpRequest.GET("/health").accept(MediaType.TEXT_PLAIN);
        String body = client.toBlocking().retrieve(req);
        assertTrue(body.contains("UP"));
    }
}