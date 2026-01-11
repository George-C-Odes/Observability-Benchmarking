package com.benchmarking.service;

import com.benchmarking.api.HealthAggregateResponse;
import com.benchmarking.api.ServiceHealthResponse;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import io.vertx.core.http.HttpClientOptions;
import io.vertx.ext.web.client.WebClientOptions;
import io.vertx.mutiny.core.Vertx;
import io.vertx.mutiny.ext.web.client.WebClient;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Aggregates health/readiness checks for the docker-compose stack.
 * This belongs in the orchestrator (backend), so browser/mobile clients don't need to know
 * internal docker DNS names.
 */
@ApplicationScoped
public class ServiceHealthService {

  /** Status value for a healthy service. */
  private static final String STATUS_UP = "up";
  /** Status value for an unhealthy or unreachable service. */
  private static final String STATUS_DOWN = "down";

  /** Special base-url value meaning this service is intentionally disabled for health checks. */
  private static final String DISABLED_BASE_URL = "false";

  /** Shared HTTP client used to perform internal health checks. */
  private final WebClient client;

  /**
   * Health-check configuration loaded from application config under {@code orchestrator.health.*}.
   *
   * <p>This drives which services are probed (service name -> base URL + health path).
   */
  private final ServiceHealthConfig config;

  /**
   * WebClient creation uses sane defaults for a small set of internal health checks.
   *
   * <p>Notably, we disable keep-alive. A couple of upstream health endpoints (and/or
   * intermediaries) can occasionally cause "HTTP/1.1 header parser received no bytes".
   * Disabling keep-alive makes these probes more robust.</p>
   */
  @Inject
  public ServiceHealthService(Vertx vertx, ServiceHealthConfig config) {
    this.config = config;

    HttpClientOptions httpClientOptions = new HttpClientOptions()
      .setKeepAlive(false)
      .setTcpKeepAlive(true)
      .setConnectTimeout(3000)
      .setMaxPoolSize(32)
      .setIdleTimeout(2)
      .setIdleTimeoutUnit(TimeUnit.SECONDS);

    WebClientOptions webClientOptions = new WebClientOptions(httpClientOptions)
      .setFollowRedirects(true)
      .setUserAgent("orchestrator-health/1.0");

    this.client = WebClient.create(vertx, webClientOptions);
  }

  private record Endpoint(String name, String baseUrl, String healthPath) {
  }

  private List<Endpoint> endpoints() {
    Map<String, ServiceHealthConfig.Service> cfgs = config.services();
    if (cfgs == null || cfgs.isEmpty()) {
      return List.of();
    }

    List<Endpoint> result = new ArrayList<>(cfgs.size());
    for (Map.Entry<String, ServiceHealthConfig.Service> e : cfgs.entrySet()) {
      String name = e.getKey();
      ServiceHealthConfig.Service cfg = e.getValue();
      if (cfg == null) {
        continue;
      }

      String baseUrl = cfg.baseUrl().orElse(null);
      if (baseUrl == null || baseUrl.isBlank()) {
        continue;
      }
      if (DISABLED_BASE_URL.equalsIgnoreCase(baseUrl.trim())) {
        continue;
      }

      result.add(new Endpoint(name, baseUrl, cfg.healthPath()));
    }

    return result;
  }

  public Uni<HealthAggregateResponse> checkAll(Optional<String> onlyService) {
    final List<Endpoint> selected = onlyService
      .map(name -> endpoints().stream().filter(e -> e.name.equals(name)).toList())
      .orElseGet(this::endpoints);

    int batchSize = Math.max(1, config.concurrency());

    return Multi.createFrom().iterable(selected)
      .group().intoLists().of(batchSize)
      .onItem().transformToUniAndMerge(batch -> Multi.createFrom().iterable(batch)
        .onItem().transformToUniAndMerge(this::checkOne)
        .collect().asList())
      .collect().asList()
      .map(batches -> {
        List<ServiceHealthResponse> all = batches.stream().flatMap(List::stream).toList();
        return new HealthAggregateResponse(all);
      });
  }

  private Uni<ServiceHealthResponse> checkOne(Endpoint endpoint) {
    long start = System.currentTimeMillis();
    long timeoutMs = config.timeoutMs() > 0 ? config.timeoutMs() : 10000;

    URI base;
    try {
      base = URI.create(endpoint.baseUrl);
    } catch (Exception ex) {
      return Uni.createFrom().item(new ServiceHealthResponse(
        endpoint.name,
        STATUS_DOWN,
        null,
        0L,
        "Invalid base URL: " + endpoint.baseUrl,
        endpoint.baseUrl,
        null
      ));
    }

    boolean ssl = "https".equalsIgnoreCase(base.getScheme());
    int port = base.getPort();
    if (port < 0) {
      port = ssl ? 443 : 80;
    }

    String host = base.getHost();
    String basePath = base.getPath() == null ? "" : base.getPath();
    String requestPath = normalizePath(basePath) + normalizePath(endpoint.healthPath);

    return client
      .get(port, host, requestPath)
      .ssl(ssl)
      .timeout(timeoutMs)
      .send()
      .map(resp -> {
        long took = System.currentTimeMillis() - start;
        int code = resp.statusCode();
        String body = resp.bodyAsString();

        if (code >= 200 && code < 300) {
          return new ServiceHealthResponse(
            endpoint.name, STATUS_UP, code, took, null, endpoint.baseUrl, body
          );
        }

        return new ServiceHealthResponse(
          endpoint.name, STATUS_DOWN, code, took, "HTTP " + code, endpoint.baseUrl, body
        );
      })
      .onFailure().recoverWithItem(ex -> {
        long took = System.currentTimeMillis() - start;
        String msg = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
        return new ServiceHealthResponse(
          endpoint.name, STATUS_DOWN, null, took, msg, endpoint.baseUrl, null
        );
      });
  }

  private static String normalizePath(String path) {
    if (path == null || path.isBlank()) {
      return "";
    }
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    if (path.endsWith("/")) {
      path = path.substring(0, path.length() - 1);
    }
    return path;
  }
}