package io.github.georgecodes.benchmarking.orchestrator.application.health;

import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.infrastructure.Infrastructure;
import io.smallrye.mutiny.unchecked.Unchecked;
import io.vertx.core.http.HttpClientOptions;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.http.RequestOptions;
import io.vertx.core.net.SocketAddress;
import io.vertx.ext.web.client.WebClientOptions;
import io.vertx.mutiny.core.Vertx;
import io.vertx.mutiny.ext.web.client.WebClient;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.concurrent.TimeUnit;

/** Vert.x WebClient adapter for probing service health endpoints. */
@ApplicationScoped
public class VertxHealthProbeClient implements HealthProbeClient {

  /** Status value for a healthy service. */
  private static final String STATUS_UP = "up";

  /** Status value for an unhealthy or unreachable service. */
  private static final String STATUS_DOWN = "down";

  /** Shared HTTP client used to perform internal health checks. */
  private final WebClient client;

  /**
   * Creates a Vert.x-backed health probe client.
   *
   * @param vertx Vert.x instance used to create the shared HTTP client
   */
  @Inject
  public VertxHealthProbeClient(Vertx vertx) {
    HttpClientOptions httpClientOptions =
        new HttpClientOptions()
            .setKeepAlive(false)
            .setConnectTimeout(3000)
            .setMaxPoolSize(32)
            .setIdleTimeout(2)
            .setIdleTimeoutUnit(TimeUnit.SECONDS);

    WebClientOptions webClientOptions =
        new WebClientOptions(httpClientOptions)
            .setFollowRedirects(true)
            .setUserAgent("orchestrator-health/1.0");

    this.client = WebClient.create(vertx, webClientOptions);
  }

  /**
   * Probes one endpoint with the Vert.x WebClient.
   *
   * @param endpoint endpoint to probe
   * @param timeoutMs request timeout in milliseconds
   * @return asynchronous service health result
   */
  @Override
  public Uni<ServiceHealth> probe(HealthEndpoint endpoint, long timeoutMs) {
    long start = System.currentTimeMillis();

    URI base;
    try {
      base = URI.create(endpoint.baseUrl());
    } catch (IllegalArgumentException ignored) {
      return Uni.createFrom()
          .item(
              new ServiceHealth(
                  endpoint.name(),
                  STATUS_DOWN,
                  null,
                  0L,
                  "Invalid base URL: " + endpoint.baseUrl(),
                  endpoint.baseUrl(),
                  null));
    }

    String host = base.getHost();
    if (host == null || host.isBlank()) {
      return Uni.createFrom()
          .item(
              new ServiceHealth(
                  endpoint.name(),
                  STATUS_DOWN,
                  null,
                  0L,
                  "Invalid base URL host: " + endpoint.baseUrl(),
                  endpoint.baseUrl(),
                  null));
    }

    boolean ssl = "https".equalsIgnoreCase(base.getScheme());
    int port = base.getPort();
    if (port < 0) {
      port = ssl ? 443 : 80;
    }

    String requestPath = normalizePath(base.getPath()) + normalizePath(endpoint.healthPath());
    final int requestPort = port;
    final boolean requestSsl = ssl;

    return resolveServerAddress(host, requestPort)
        .map(
            serverAddress ->
                new RequestOptions()
                    .setServer(serverAddress)
                    .setHost(host)
                    .setPort(requestPort)
                    .setURI(requestPath)
                    .setSsl(requestSsl))
        .flatMap(
            requestOptions ->
                client.request(HttpMethod.GET, requestOptions).timeout(timeoutMs).send())
        .map(resp -> toServiceHealth(endpoint, start, resp.statusCode(), resp.bodyAsString()))
        .onFailure()
        .recoverWithItem(ex -> failedServiceHealth(endpoint, start, ex));
  }

  private static ServiceHealth toServiceHealth(
      HealthEndpoint endpoint, long start, int statusCode, String body) {
    long took = System.currentTimeMillis() - start;
    if (statusCode >= 200 && statusCode < 300) {
      return new ServiceHealth(
          endpoint.name(), STATUS_UP, statusCode, took, null, endpoint.baseUrl(), body);
    }
    return new ServiceHealth(
        endpoint.name(),
        STATUS_DOWN,
        statusCode,
        took,
        "HTTP " + statusCode,
        endpoint.baseUrl(),
        body);
  }

  private static ServiceHealth failedServiceHealth(
      HealthEndpoint endpoint, long start, Throwable exception) {
    long took = System.currentTimeMillis() - start;
    String msg =
        exception.getMessage() == null
            ? exception.getClass().getSimpleName()
            : exception.getMessage();
    return new ServiceHealth(
        endpoint.name(), STATUS_DOWN, null, took, msg, endpoint.baseUrl(), null);
  }

  private static Uni<SocketAddress> resolveServerAddress(String host, int port) {
    return Uni.createFrom()
        .item(
            Unchecked.supplier(
                () -> {
                  try {
                    InetAddress address = InetAddress.getByName(host);
                    return SocketAddress.inetSocketAddress(port, address.getHostAddress());
                  } catch (UnknownHostException ex) {
                    throw new IllegalStateException("Failed to resolve host: " + host, ex);
                  }
                }))
        .runSubscriptionOn(Infrastructure.getDefaultExecutor());
  }

  private static String normalizePath(String path) {
    if (path == null || path.isBlank()) {
      return "";
    }
    String normalized = path;
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }
    if (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    return normalized;
  }
}
