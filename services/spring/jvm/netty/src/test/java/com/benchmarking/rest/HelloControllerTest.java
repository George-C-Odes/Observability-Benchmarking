package com.benchmarking.rest;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
public class HelloControllerTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    public void testReactiveEndpoint() {
        webTestClient.get()
            .uri("/hello/reactive")
            .exchange()
            .expectStatus().isOk()
            .expectHeader().contentType(MediaType.APPLICATION_JSON)
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
            .expectHeader().contentType(MediaType.APPLICATION_JSON)
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
            .expectHeader().contentType(MediaType.APPLICATION_JSON)
            .expectBody(String.class)
            .consumeWith(response -> {
                String body = response.getResponseBody();
                org.assertj.core.api.Assertions.assertThat(body).contains("Hello from Boot reactive REST");
            });
    }
}
