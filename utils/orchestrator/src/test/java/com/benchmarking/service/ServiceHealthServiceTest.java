package com.benchmarking.service;

import com.benchmarking.api.HealthAggregateResponse;
import com.benchmarking.api.ServiceHealthResponse;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class ServiceHealthServiceTest {

  private static Vertx serverVertx;
  private static int okPort;
  private static int downPort;

  private static ServiceHealthService service;

  @BeforeAll
  static void startServers() {
    serverVertx = Vertx.vertx();

    Router okRouter = Router.router(serverVertx);
    okRouter.get("/*").handler(ctx -> ctx.response().setStatusCode(200).end("OK"));
    okPort = listen(okRouter);

    Router downRouter = Router.router(serverVertx);
    downRouter.get("/*").handler(ctx -> ctx.response().setStatusCode(500).end("FAIL"));
    downPort = listen(downRouter);

    // Create the service with a Mutiny Vertx wrapper.
    service = new ServiceHealthService(new io.vertx.mutiny.core.Vertx(serverVertx));
    service.defaultTimeoutMs = 2000;
    service.concurrency = 4;
  }

  private static int listen(Router router) {
    var httpServer = serverVertx.createHttpServer().requestHandler(router);
    var result = httpServer.listen(0).toCompletionStage().toCompletableFuture().join();
    return result.actualPort();
  }

  @AfterAll
  static void stopServers() {
    if (serverVertx != null) {
      serverVertx.close().toCompletionStage().toCompletableFuture().join();
    }
  }

  @Test
  void checkAll_returnsUpAndDownAndBaseUrl() {
    service.endpointBaseUrls = Map.ofEntries(
      Map.entry("grafana", "http://localhost:" + downPort),
      Map.entry("loki", "http://localhost:" + okPort),
      Map.entry("orchestrator", "http://localhost:" + okPort)
    );

    HealthAggregateResponse resp = service.checkAll(Optional.empty()).await().indefinitely();

    ServiceHealthResponse grafana = resp.services().stream().filter(s -> s.name().equals("grafana")).findFirst().orElseThrow();
    ServiceHealthResponse loki = resp.services().stream().filter(s -> s.name().equals("loki")).findFirst().orElseThrow();

    assertEquals("down", grafana.status());
    assertEquals("http://localhost:" + downPort, grafana.url());

    assertEquals("up", loki.status());
    assertEquals("http://localhost:" + okPort, loki.url());
  }

  @Test
  void checkAll_onlyServiceFilters() {
    service.endpointBaseUrls = Map.ofEntries(
      Map.entry("grafana", "http://localhost:" + downPort),
      Map.entry("loki", "http://localhost:" + okPort),
      Map.entry("orchestrator", "http://localhost:" + okPort)
    );

    HealthAggregateResponse resp = service.checkAll(Optional.of("grafana")).await().indefinitely();
    assertEquals(1, resp.services().size());
    assertEquals("grafana", resp.services().getFirst().name());
    assertEquals("down", resp.services().getFirst().status());
  }

  @Test
  void invalidBaseUrl_marksDownWithError() {
    service.endpointBaseUrls = Map.ofEntries(
      Map.entry("go", "::not-a-url::"),
      Map.entry("orchestrator", "http://localhost:" + okPort)
    );

    HealthAggregateResponse resp = service.checkAll(Optional.of("go")).await().indefinitely();
    assertEquals(1, resp.services().size());

    ServiceHealthResponse g = resp.services().getFirst();
    assertEquals("down", g.status());
    assertEquals("::not-a-url::", g.url());
    assertNotNull(g.error());
  }
}
