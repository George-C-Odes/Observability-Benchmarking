package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.api.HealthAggregateResponse;
import io.github.georgecodes.benchmarking.orchestrator.api.ServiceHealthResponse;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import io.smallrye.mutiny.infrastructure.Infrastructure;
import io.smallrye.mutiny.unchecked.Unchecked;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.http.HttpClientOptions;
import io.vertx.core.http.RequestOptions;
import io.vertx.core.net.SocketAddress;
import io.vertx.ext.web.client.WebClientOptions;
import io.vertx.mutiny.core.Vertx;
import io.vertx.mutiny.ext.web.client.WebClient;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.net.InetAddress;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
   * <p>This drives which services are probed (service name -> base URL and health path).
   */
  private final ServiceHealthConfig config;

  /**
   * WebClient creation uses sane defaults for a small set of internal health checks.
   *
   * <p>Notably, we disable keep-alive. A couple of upstream health endpoints (and/or
   * intermediaries) can occasionally cause "HTTP/1.1 header parser received no bytes".
   * Disabling keep-alive makes these probes more robust.</p>
   *
   * @param vertx Vert.x instance used to create the shared HTTP client
   * @param config health-check configuration describing target services and timeouts
   */
  @Inject
  public ServiceHealthService(Vertx vertx, ServiceHealthConfig config) {
    this.config = config;

    HttpClientOptions httpClientOptions = new HttpClientOptions()
      .setKeepAlive(false)
      .setConnectTimeout(3000)
      .setMaxPoolSize(32)
      .setIdleTimeout(2)
      .setIdleTimeoutUnit(TimeUnit.SECONDS);

    WebClientOptions webClientOptions = new WebClientOptions(httpClientOptions)
      .setFollowRedirects(true)
      .setUserAgent("orchestrator-health/1.0");

    this.client = WebClient.create(vertx, webClientOptions);
  }

  /**
   * Internal endpoint definition derived from service health configuration.
   *
   * @param name the service name
   * @param baseUrl the base URL used for the probe
   * @param healthPath the relative health-check path
   */
  private record Endpoint(String name, String baseUrl, String healthPath) {
  }

  /**
   * Builds the list of configured service endpoints that should be health-checked.
   *
   * @return the enabled endpoint definitions derived from configuration
   */
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

  /**
   * Checks all configured services, optionally filtering to a single named service.
   *
   * @param onlyService optional service name filter; when blank, all services are checked
   * @return an asynchronous aggregate response containing the health result set
   */
  public Uni<HealthAggregateResponse> checkAll(String onlyService) {
    final List<Endpoint> selected = (onlyService != null && !onlyService.isBlank())
      ? endpoints().stream().filter(e -> e.name.equals(onlyService)).toList()
      : endpoints();

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

  /**
   * Checks a single configured endpoint and converts the result into a response model.
   *
   * @param endpoint the endpoint definition to probe
   * @return the asynchronous health result for the endpoint
   */
  private Uni<ServiceHealthResponse> checkOne(Endpoint endpoint) {
    long start = System.currentTimeMillis();
    long timeoutMs = config.timeoutMs() > 0 ? config.timeoutMs() : 10000;

    URI base;
    try {
      base = URI.create(endpoint.baseUrl);
    } catch (Exception ignored) {
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
    if (host == null || host.isBlank()) {
      return Uni.createFrom().item(new ServiceHealthResponse(
        endpoint.name,
        STATUS_DOWN,
        null,
        0L,
        "Invalid base URL host: " + endpoint.baseUrl,
        endpoint.baseUrl,
        null
      ));
    }

    String basePath = base.getPath() == null ? "" : base.getPath();
    String requestPath = normalizePath(basePath) + normalizePath(endpoint.healthPath);
    final int requestPort = port;
    final String requestHost = host;
    final boolean requestSsl = ssl;

    return resolveServerAddress(requestHost, requestPort)
      .map(serverAddress -> new RequestOptions()
        .setServer(serverAddress)
        .setHost(requestHost)
        .setPort(requestPort)
        .setURI(requestPath)
        .setSsl(requestSsl))
      .flatMap(requestOptions -> client
        .request(HttpMethod.GET, requestOptions)
        .timeout(timeoutMs)
        .send())
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

  /**
   * Resolves the target host into a socket address before issuing the HTTP request.
   *
   * @param host the host name to resolve
   * @param port the target port
   * @return the asynchronous resolved socket address
   */
  private Uni<SocketAddress> resolveServerAddress(String host, int port) {
    return Uni.createFrom().item(Unchecked.supplier(() -> {
      try {
        InetAddress address = InetAddress.getByName(host);
        return SocketAddress.inetSocketAddress(port, address.getHostAddress());
      } catch (Exception ex) {
        throw new IllegalStateException("Failed to resolve host: " + host, ex);
      }
    })).runSubscriptionOn(Infrastructure.getDefaultExecutor());
  }

  /**
   * Normalizes a request path so path fragments can be safely concatenated.
   *
   * @param path the path fragment to normalize
   * @return the normalized path fragment, or an empty string when blank
   */
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