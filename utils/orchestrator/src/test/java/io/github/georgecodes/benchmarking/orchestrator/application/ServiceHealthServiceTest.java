package io.github.georgecodes.benchmarking.orchestrator.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.github.georgecodes.benchmarking.orchestrator.application.health.HealthAggregate;
import io.github.georgecodes.benchmarking.orchestrator.application.health.HealthEndpoint;
import io.github.georgecodes.benchmarking.orchestrator.application.health.ServiceHealth;
import io.github.georgecodes.benchmarking.orchestrator.application.health.VertxHealthProbeClient;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import java.io.IOException;
import java.net.ServerSocket;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class ServiceHealthServiceTest {

  private static Vertx serverVertx;
  private static int okPort;
  private static int downPort;

  private static ServiceHealthConfig configFor(Map<String, ServiceHealthConfig.Service> services) {
    return configFor(2000, 4, services);
  }

  private static ServiceHealthConfig configFor(
      long timeoutMs, int concurrency, Map<String, ServiceHealthConfig.Service> services) {
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
      public Optional<String> baseUrl() {
        return Optional.ofNullable(baseUrl);
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
  void testCheckAllReturnsUpAndDownAndBaseUrl() {
    ServiceHealthService service =
        newService(
            configFor(
                Map.of(
                    "grafana", svc("http://localhost:" + downPort, "/api/health"),
                    "loki", svc("http://localhost:" + okPort, "/ready"),
                    "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();

    ServiceHealth grafanaResp =
        resp.services().stream().filter(s -> "grafana".equals(s.name())).findFirst().orElseThrow();
    ServiceHealth lokiResp =
        resp.services().stream().filter(s -> "loki".equals(s.name())).findFirst().orElseThrow();

    assertEquals(
        "down", grafanaResp.status(), "Grafana should be reported as down after a 500 response.");
    assertEquals(
        "http://localhost:" + downPort,
        grafanaResp.baseUrl(),
        "Grafana's configured base URL should be preserved.");

    assertEquals("up", lokiResp.status(), "Loki should be reported as up after a 200 response.");
    assertEquals(
        "http://localhost:" + okPort,
        lokiResp.baseUrl(),
        "Loki's configured base URL should be preserved.");
  }

  @Test
  void testCheckAllHandlesNullServiceMapAndBlankFilterAsEmptySelection() {
    ServiceHealthService service = newService(configFor(null));

    HealthAggregate resp = service.checkAll(" ").await().indefinitely();

    assertEquals(
        List.of(),
        resp.services(),
        "A null service map and blank filter should select no services.");
  }

  @Test
  void testCheckAllOnlyServiceFilters() {
    ServiceHealthService service =
        newService(
            configFor(
                Map.of(
                    "grafana", svc("http://localhost:" + downPort, "/api/health"),
                    "loki", svc("http://localhost:" + okPort, "/ready"),
                    "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready"))));

    HealthAggregate resp = service.checkAll("grafana").await().indefinitely();
    assertEquals(
        1, resp.services().size(), "Filtering for Grafana should return exactly one service.");
    assertEquals(
        "grafana", resp.services().getFirst().name(), "The selected service should be Grafana.");
    assertEquals(
        "down",
        resp.services().getFirst().status(),
        "Grafana's failing endpoint should be reported as down.");
  }

  @Test
  void testInvalidBaseUrlMarksDownWithError() {
    ServiceHealthService service =
        newService(
            configFor(
                Map.of(
                    "go", svc("::not-a-url::", "/readyz"),
                    "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready"))));

    HealthAggregate resp = service.checkAll("go").await().indefinitely();
    assertEquals(
        1, resp.services().size(), "Filtering for the invalid URL should return one service.");

    ServiceHealth g = resp.services().getFirst();
    assertEquals("down", g.status(), "An invalid base URL should be reported as down.");
    assertEquals(
        "::not-a-url::", g.baseUrl(), "The invalid configured base URL should be retained.");
    assertNotNull(g.error(), "An invalid base URL should include an error description.");
  }

  @Test
  void testBaseUrlFalseSkipsService() {
    ServiceHealthService service =
        newService(
            configFor(
                Map.of(
                    "grafana", svc("false", "/api/health"),
                    "loki", svc("http://localhost:" + okPort, "/ready"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();

    assertTrue(
        resp.services().stream().noneMatch(s -> "grafana".equals(s.name())),
        "Services with a false base URL should be skipped.");
    assertTrue(
        resp.services().stream().anyMatch(s -> "loki".equals(s.name())),
        "Enabled services should remain in the health response.");
  }

  @Test
  void testNullBlankAndDisabledBaseUrlsAreSkipped() {
    Map<String, ServiceHealthConfig.Service> services = new LinkedHashMap<>();
    services.put("null-config", null);
    services.put("blank", svc(" ", "/health"));
    services.put("disabled", svc("FALSE", "/health"));
    services.put("ok", svc("http://localhost:" + okPort, "/ready"));

    ServiceHealthService service = newService(configFor(services));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();

    assertEquals(
        1, resp.services().size(), "Null, blank, and disabled base URLs should all be skipped.");
    assertEquals(
        "ok",
        resp.services().getFirst().name(),
        "Only the service with a configured URL should remain.");
    assertEquals(
        "up", resp.services().getFirst().status(), "The remaining service should be healthy.");
  }

  @Test
  void testNonPositiveTimeoutAndConcurrencyFallbackStillWorkAndNormalizePaths() {
    ServiceHealthService service =
        newService(
            configFor(
                0, 0, Map.of("loki", svc("http://localhost:" + okPort + "/base/", "ready/"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();

    assertEquals(
        1, resp.services().size(), "The health check should return the configured Loki service.");
    assertEquals("loki", resp.services().getFirst().name(), "The returned service should be Loki.");
    assertEquals(
        "up",
        resp.services().getFirst().status(),
        "Fallback timeout and concurrency values should allow the check to succeed.");
    assertEquals(
        200,
        resp.services().getFirst().statusCode(),
        "The normalized health path should return HTTP 200.");
  }

  @Test
  void testUnreachableHostMarksServiceDownWithRecoveredError() throws IOException {
    int unusedPort;
    try (ServerSocket socket = new ServerSocket(0)) {
      unusedPort = socket.getLocalPort();
    }

    ServiceHealthService service =
        newService(configFor(Map.of("orphan", svc("http://localhost:" + unusedPort, "/ready"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();
    ServiceHealth orphan = resp.services().getFirst();

    assertEquals(
        "orphan",
        orphan.name(),
        "The unreachable service should be included in the health response.");
    assertEquals("down", orphan.status(), "A connection failure should be reported as down.");
    assertNull(orphan.statusCode(), "A connection failure should not have an HTTP status code.");
    assertNotNull(
        orphan.error(), "A connection failure should include a recovered error description.");
  }

  @Test
  void testUnresolvableHostnameMarksServiceDownWithRecoveredError() {
    ServiceHealthService service =
        newService(
            configFor(Map.of("missing-dns", svc("http://missing-host.invalid:18080", "/ready"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();
    ServiceHealth missingDns = resp.services().getFirst();

    assertEquals(
        "missing-dns",
        missingDns.name(),
        "The unresolvable service should be included in the health response.");
    assertEquals(
        "down", missingDns.status(), "A DNS resolution failure should be reported as down.");
    assertNull(
        missingDns.statusCode(), "A DNS resolution failure should not have an HTTP status code.");
    assertNotNull(
        missingDns.error(),
        "A DNS resolution failure should include a recovered error description.");
  }

  @Test
  void testProbeClientCoversInvalidHostAndDefaultHttpAndHttpsPorts() {
    var mutinyVertx = new io.vertx.mutiny.core.Vertx(serverVertx);
    VertxHealthProbeClient probeClient = new VertxHealthProbeClient(mutinyVertx);

    ServiceHealth noHost =
        probeClient
            .probe(new HealthEndpoint("no-host", "http:///ready", "/health"), 100)
            .await()
            .indefinitely();
    ServiceHealth httpDefaultPort =
        probeClient
            .probe(new HealthEndpoint("http-default", "http://localhost", "ready"), 100)
            .await()
            .indefinitely();
    ServiceHealth httpsDefaultPort =
        probeClient
            .probe(new HealthEndpoint("https-default", "https://localhost", "ready"), 100)
            .await()
            .indefinitely();

    assertEquals("down", noHost.status(), "A URL without a host should be reported as down.");
    assertTrue(
        noHost.error().startsWith("Invalid base URL host"),
        "A URL without a host should report the invalid-host error.");
    assertEquals(
        "http-default",
        httpDefaultPort.name(),
        "The HTTP default-port probe should preserve its service name.");
    assertEquals(
        "https-default",
        httpsDefaultPort.name(),
        "The HTTPS default-port probe should preserve its service name.");
  }

  private static ServiceHealthService newService(ServiceHealthConfig config) {
    var mutinyVertx = new io.vertx.mutiny.core.Vertx(serverVertx);
    return new ServiceHealthService(config, new VertxHealthProbeClient(mutinyVertx));
  }
}
