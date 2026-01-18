package com.benchmarking.application;

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

  private static ServiceHealthConfig configFor(Map<String, ServiceHealthConfig.Service> services) {
    return new ServiceHealthConfig() {
      @Override
      public long timeoutMs() {
        return 2000;
      }

      @Override
      public int concurrency() {
        return 4;
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

    HealthAggregateResponse resp = service.checkAll(Optional.empty()).await().indefinitely();

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

    HealthAggregateResponse resp = service.checkAll(Optional.of("grafana")).await().indefinitely();
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

    HealthAggregateResponse resp = service.checkAll(Optional.of("go")).await().indefinitely();
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

    HealthAggregateResponse resp = service.checkAll(Optional.empty()).await().indefinitely();

    assertTrue(resp.services().stream().noneMatch(s -> s.name().equals("grafana")));
    assertTrue(resp.services().stream().anyMatch(s -> s.name().equals("loki")));
  }
}
