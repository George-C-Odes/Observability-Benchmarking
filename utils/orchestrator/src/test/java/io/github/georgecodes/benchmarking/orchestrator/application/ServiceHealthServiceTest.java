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

  private static ServiceHealthService service;

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

    service = newService(configFor(Map.of()));
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
    service =
        newService(
            configFor(
                Map.of(
                    "grafana", svc("http://localhost:" + downPort, "/api/health"),
                    "loki", svc("http://localhost:" + okPort, "/ready"),
                    "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();

    ServiceHealth grafanaResp =
        resp.services().stream().filter(s -> s.name().equals("grafana")).findFirst().orElseThrow();
    ServiceHealth lokiResp =
        resp.services().stream().filter(s -> s.name().equals("loki")).findFirst().orElseThrow();

    assertEquals("down", grafanaResp.status());
    assertEquals("http://localhost:" + downPort, grafanaResp.baseUrl());

    assertEquals("up", lokiResp.status());
    assertEquals("http://localhost:" + okPort, lokiResp.baseUrl());
  }

  @Test
  void checkAll_handlesNullServiceMapAndBlankFilterAsEmptySelection() {
    service = newService(configFor(null));

    HealthAggregate resp = service.checkAll(" ").await().indefinitely();

    assertEquals(List.of(), resp.services());
  }

  @Test
  void checkAll_onlyServiceFilters() {
    service =
        newService(
            configFor(
                Map.of(
                    "grafana", svc("http://localhost:" + downPort, "/api/health"),
                    "loki", svc("http://localhost:" + okPort, "/ready"),
                    "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready"))));

    HealthAggregate resp = service.checkAll("grafana").await().indefinitely();
    assertEquals(1, resp.services().size());
    assertEquals("grafana", resp.services().getFirst().name());
    assertEquals("down", resp.services().getFirst().status());
  }

  @Test
  void invalidBaseUrl_marksDownWithError() {
    service =
        newService(
            configFor(
                Map.of(
                    "go", svc("::not-a-url::", "/readyz"),
                    "orchestrator", svc("http://localhost:" + okPort, "/q/health/ready"))));

    HealthAggregate resp = service.checkAll("go").await().indefinitely();
    assertEquals(1, resp.services().size());

    ServiceHealth g = resp.services().getFirst();
    assertEquals("down", g.status());
    assertEquals("::not-a-url::", g.baseUrl());
    assertNotNull(g.error());
  }

  @Test
  void baseUrlFalse_skipsService() {
    service =
        newService(
            configFor(
                Map.of(
                    "grafana", svc("false", "/api/health"),
                    "loki", svc("http://localhost:" + okPort, "/ready"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();

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

    service = newService(configFor(services));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();

    assertEquals(1, resp.services().size());
    assertEquals("ok", resp.services().getFirst().name());
    assertEquals("up", resp.services().getFirst().status());
  }

  @Test
  void nonPositiveTimeoutAndConcurrencyFallbackStillWorkAndNormalizePaths() {
    service =
        newService(
            configFor(
                0, 0, Map.of("loki", svc("http://localhost:" + okPort + "/base/", "ready/"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();

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

    service =
        newService(configFor(Map.of("orphan", svc("http://localhost:" + unusedPort, "/ready"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();
    ServiceHealth orphan = resp.services().getFirst();

    assertEquals("orphan", orphan.name());
    assertEquals("down", orphan.status());
    assertNull(orphan.statusCode());
    assertNotNull(orphan.error());
  }

  @Test
  void unresolvableHostname_marksServiceDownWithRecoveredError() {
    service =
        newService(
            configFor(Map.of("missing-dns", svc("http://missing-host.invalid:18080", "/ready"))));

    HealthAggregate resp = service.checkAll(null).await().indefinitely();
    ServiceHealth missingDns = resp.services().getFirst();

    assertEquals("missing-dns", missingDns.name());
    assertEquals("down", missingDns.status());
    assertNull(missingDns.statusCode());
    assertNotNull(missingDns.error());
  }

  @Test
  void probeClientCoversInvalidHostAndDefaultHttpAndHttpsPorts() {
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

    assertEquals("down", noHost.status());
    assertTrue(noHost.error().startsWith("Invalid base URL host"));
    assertEquals("http-default", httpDefaultPort.name());
    assertEquals("https-default", httpsDefaultPort.name());
  }

  private static ServiceHealthService newService(ServiceHealthConfig config) {
    var mutinyVertx = new io.vertx.mutiny.core.Vertx(serverVertx);
    return new ServiceHealthService(config, new VertxHealthProbeClient(mutinyVertx));
  }
}
