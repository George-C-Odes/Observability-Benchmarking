package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.api.HealthAggregateResponse;
import io.github.georgecodes.benchmarking.orchestrator.api.ServiceHealthResponse;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.ServerSocket;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ServiceHealthServiceTest {

  private static Vertx serverVertx;
  private static int okPort;
  private static int downPort;

  private static ServiceHealthService service;

  private static ServiceHealthConfig configFor(Map<String, ServiceHealthConfig.Service> services) {
    return configFor(2000, 4, services);
  }

  private static ServiceHealthConfig configFor(long timeoutMs, int concurrency,
                                               Map<String, ServiceHealthConfig.Service> services) {
    return new ServiceHealthConfig() {
      @Override
      public long timeoutMs() {
        return timeoutMs;
      }

      @Override
      public int concurrency() {
        return concurrency;
      }

      @Override
      public Map<String, Service> services() {
        return services;
      }
    };
  }

  private static ServiceHealthConfig.Service svc(String baseUrl, String healthPath) {
    return new ServiceHealthConfig.Service() {
      @Override
      public java.util.Optional<String> baseUrl() {
        return java.util.Optional.ofNullable(baseUrl);
      }

      @Override
      public String healthPath() {
        return healthPath;
      }
    };
  }

  @BeforeAll
  static void startServers() {
    serverVertx = Vertx.vertx();

    Router okRouter = Router.router(serverVertx);
    okRouter.get("/*").handler(ctx -> ctx.response().setStatusCode(200).end("OK"));
    okPort = listen(okRouter);

    Router downRouter = Router.router(serverVertx);
    downRouter.get("/*").handler(ctx -> ctx.response().setStatusCode(500).end("FAIL"));
    downPort = listen(downRouter);

    // Create the service with a Mutiny Vertx wrapper + a test config mapping.
    service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(serverVertx),
      configFor(Map.of())
    );
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
    service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(serverVertx),
      configFor(Map.of(
        "grafana", svc("http://localhost:" + downPort, "/api/health"),
        "loki", svc("http://localhost:" + okPort, "/ready"),
        "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready")
      ))
    );

    HealthAggregateResponse resp = service.checkAll(null).await().indefinitely();

    ServiceHealthResponse grafanaResp = resp.services().stream().filter(s -> s.name().equals("grafana")).findFirst().orElseThrow();
    ServiceHealthResponse lokiResp = resp.services().stream().filter(s -> s.name().equals("loki")).findFirst().orElseThrow();

    assertEquals("down", grafanaResp.status());
    assertEquals("http://localhost:" + downPort, grafanaResp.baseUrl());

    assertEquals("up", lokiResp.status());
    assertEquals("http://localhost:" + okPort, lokiResp.baseUrl());
  }

  @Test
  void checkAll_onlyServiceFilters() {
    service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(serverVertx),
      configFor(Map.of(
        "grafana", svc("http://localhost:" + downPort, "/api/health"),
        "loki", svc("http://localhost:" + okPort, "/ready"),
        "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready")
      ))
    );

    HealthAggregateResponse resp = service.checkAll("grafana").await().indefinitely();
    assertEquals(1, resp.services().size());
    assertEquals("grafana", resp.services().getFirst().name());
    assertEquals("down", resp.services().getFirst().status());
  }

  @Test
  void invalidBaseUrl_marksDownWithError() {
    service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(serverVertx),
      configFor(Map.of(
        "go", svc("::not-a-url::", "/readyz"),
        "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready")
      ))
    );

    HealthAggregateResponse resp = service.checkAll("go").await().indefinitely();
    assertEquals(1, resp.services().size());

    ServiceHealthResponse g = resp.services().getFirst();
    assertEquals("down", g.status());
    assertEquals("::not-a-url::", g.baseUrl());
    assertNotNull(g.error());
  }

  @Test
  void baseUrlFalse_skipsService() {
    service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(serverVertx),
      configFor(Map.of(
        "grafana", svc("false", "/api/health"),
        "loki", svc("http://localhost:" + okPort, "/ready")
      ))
    );

    HealthAggregateResponse resp = service.checkAll(null).await().indefinitely();

    assertTrue(resp.services().stream().noneMatch(s -> s.name().equals("grafana")));
    assertTrue(resp.services().stream().anyMatch(s -> s.name().equals("loki")));
  }

  @Test
  void nullBlankAndDisabledBaseUrlsAreSkipped() {
    Map<String, ServiceHealthConfig.Service> services = new LinkedHashMap<>();
    services.put("null-config", null);
    services.put("blank", svc(" ", "/health"));
    services.put("disabled", svc("FALSE", "/health"));
    services.put("ok", svc("http://localhost:" + okPort, "/ready"));

    service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(serverVertx),
      configFor(services)
    );

    HealthAggregateResponse resp = service.checkAll(null).await().indefinitely();

    assertEquals(1, resp.services().size());
    assertEquals("ok", resp.services().getFirst().name());
    assertEquals("up", resp.services().getFirst().status());
  }

  @Test
  void nonPositiveTimeoutAndConcurrencyFallbackStillWorkAndNormalizePaths() {
    service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(serverVertx),
      configFor(0, 0, Map.of(
        "loki", svc("http://localhost:" + okPort + "/base/", "ready/")
      ))
    );

    HealthAggregateResponse resp = service.checkAll(null).await().indefinitely();

    assertEquals(1, resp.services().size());
    assertEquals("loki", resp.services().getFirst().name());
    assertEquals("up", resp.services().getFirst().status());
    assertEquals(200, resp.services().getFirst().statusCode());
  }

  @Test
  void unreachableHost_marksServiceDownWithRecoveredError() throws IOException {
    int unusedPort;
    try (ServerSocket socket = new ServerSocket(0)) {
      unusedPort = socket.getLocalPort();
    }

    service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(serverVertx),
      configFor(Map.of(
        "orphan", svc("http://localhost:" + unusedPort, "/ready")
      ))
    );

    HealthAggregateResponse resp = service.checkAll(null).await().indefinitely();
    ServiceHealthResponse orphan = resp.services().getFirst();

    assertEquals("orphan", orphan.name());
    assertEquals("down", orphan.status());
    assertNull(orphan.statusCode());
    assertNotNull(orphan.error());
  }
}
