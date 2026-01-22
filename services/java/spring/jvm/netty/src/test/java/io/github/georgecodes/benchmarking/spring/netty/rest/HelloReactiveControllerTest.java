package io.github.georgecodes.benchmarking.spring.netty.rest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class HelloReactiveControllerTest {

    @LocalServerPort
    int port;

    private WebTestClient webTestClient;

    @BeforeEach
    void setUp() {
        this.webTestClient = WebTestClient.bindToServer()
            .baseUrl("http://localhost:" + port)
            .build();
    }

    @Test
    public void testReactiveEndpoint() {
        webTestClient.get()
            .uri("/hello/reactive")
            .exchange()
            .expectStatus().isOk()
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody(String.class)
            .consumeWith(response -> {
                String body = response.getResponseBody();
                org.assertj.core.api.Assertions.assertThat(body).contains("Hello from Boot reactive REST");
            });
    }

    @Test
    public void testReactiveEndpointWithSleep() {
        webTestClient.get()
            .uri(uriBuilder -> uriBuilder
                .path("/hello/reactive")
                .queryParam("sleep", 1)
                .build())
            .exchange()
            .expectStatus().isOk()
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody(String.class)
            .consumeWith(response -> {
                String body = response.getResponseBody();
                org.assertj.core.api.Assertions.assertThat(body).contains("Hello from Boot reactive REST");
            });
    }

    @Test
    public void testReactiveEndpointWithLog() {
        webTestClient.get()
            .uri(uriBuilder -> uriBuilder
                .path("/hello/reactive")
                .queryParam("log", true)
                .build())
            .exchange()
            .expectStatus().isOk()
            .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
            .expectBody(String.class)
            .consumeWith(response -> {
                String body = response.getResponseBody();
                org.assertj.core.api.Assertions.assertThat(body).contains("Hello from Boot reactive REST");
            });
    }
}