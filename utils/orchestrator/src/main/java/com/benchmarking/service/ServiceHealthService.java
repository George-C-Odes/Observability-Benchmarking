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
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.net.URI;
import java.util.LinkedHashMap;
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

  private static final String STATUS_UP = "up";
  private static final String STATUS_DOWN = "down";

  private final WebClient client;

  @ConfigProperty(name = "orchestrator.health.timeout-ms", defaultValue = "10000")
  long defaultTimeoutMs;

  @ConfigProperty(name = "orchestrator.health.concurrency", defaultValue = "8")
  int concurrency;

  @ConfigProperty(name = "orchestrator.health.endpoints")
  Map<String, String> endpointBaseUrls;

  private Map<String, String> effectiveBaseUrls() {
    // Tests can override endpointBaseUrls directly; Quarkus config injection can still populate it in prod.
    return endpointBaseUrls == null ? Map.of() : endpointBaseUrls;
  }

  /**
   * WebClient creation uses sane defaults for a small set of internal health checks.
   *
   * <p>Notably, we disable keep-alive. A couple of upstream health endpoints (and/or
   * intermediaries) can occasionally cause "HTTP/1.1 header parser received no bytes".
   * Disabling keep-alive makes these probes more robust.</p>
   */
  @Inject
  public ServiceHealthService(Vertx vertx) {
    HttpClientOptions httpClientOptions = new HttpClientOptions()
      .setKeepAlive(false)
      .setTcpKeepAlive(true)
      .setConnectTimeout(5000)
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
    // Use a stable order for UI rendering.
    Map<String, String> baseUrls = effectiveBaseUrls();
    Map<String, Endpoint> eps = new LinkedHashMap<>();

    // Observability
    eps.put("grafana", new Endpoint("grafana", baseUrls.get("grafana"), "/api/health"));
    eps.put("alloy", new Endpoint("alloy", baseUrls.get("alloy"), "/-/ready"));
    eps.put("loki", new Endpoint("loki", baseUrls.get("loki"), "/ready"));
    eps.put("mimir", new Endpoint("mimir", baseUrls.get("mimir"), "/ready"));
    eps.put("tempo", new Endpoint("tempo", baseUrls.get("tempo"), "/ready"));
    eps.put("pyroscope", new Endpoint("pyroscope", baseUrls.get("pyroscope"), "/ready"));

    // Spring
    eps.put("spring-jvm-tomcat-platform", new Endpoint(
      "spring-jvm-tomcat-platform",
      baseUrls.get("spring-jvm-tomcat-platform"),
      "/actuator/health/readiness"
    ));
    eps.put("spring-jvm-tomcat-virtual", new Endpoint(
      "spring-jvm-tomcat-virtual",
      baseUrls.get("spring-jvm-tomcat-virtual"),
      "/actuator/health/readiness"
    ));
    eps.put("spring-jvm-netty", new Endpoint(
      "spring-jvm-netty",
      baseUrls.get("spring-jvm-netty"),
      "/actuator/health/readiness"
    ));
    eps.put("spring-native-tomcat-platform", new Endpoint(
      "spring-native-tomcat-platform",
      baseUrls.get("spring-native-tomcat-platform"),
      "/actuator/health/readiness"
    ));
    eps.put("spring-native-tomcat-virtual", new Endpoint(
      "spring-native-tomcat-virtual",
      baseUrls.get("spring-native-tomcat-virtual"),
      "/actuator/health/readiness"
    ));
    eps.put("spring-native-netty", new Endpoint(
      "spring-native-netty",
      baseUrls.get("spring-native-netty"),
      "/actuator/health/readiness"
    ));

    // Quarkus
    eps.put(
      "quarkus-jvm",
      new Endpoint("quarkus-jvm", baseUrls.get("quarkus-jvm"), "/q/health/ready")
    );
    eps.put(
      "quarkus-native",
      new Endpoint("quarkus-native", baseUrls.get("quarkus-native"), "/q/health/ready")
    );

    // Go
    eps.put("go", new Endpoint("go", baseUrls.get("go"), "/readyz"));

    // Utils
    eps.put("nextjs-dash", new Endpoint("nextjs-dash", baseUrls.get("nextjs-dash"), "/api/app-health"));
    eps.put("orchestrator", new Endpoint("orchestrator", baseUrls.get("orchestrator"), "/q/health/ready"));

    return eps.values().stream().filter(e -> e.baseUrl != null && !e.baseUrl.isBlank()).toList();
  }

  public Uni<HealthAggregateResponse> checkAll(Optional<String> onlyService) {
    final List<Endpoint> selected = onlyService
      .map(name -> endpoints().stream().filter(e -> e.name.equals(name)).toList())
      .orElseGet(this::endpoints);

    int batchSize = Math.max(1, concurrency);

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
    long timeoutMs = defaultTimeoutMs > 0 ? defaultTimeoutMs : 10000;

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
          return new ServiceHealthResponse(endpoint.name, STATUS_UP, code, took, null, endpoint.baseUrl, body);
        }

        return new ServiceHealthResponse(endpoint.name, STATUS_DOWN, code, took, "HTTP " + code, endpoint.baseUrl, body);
      })
      .onFailure().recoverWithItem(ex -> {
        long took = System.currentTimeMillis() - start;
        String msg = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
        return new ServiceHealthResponse(endpoint.name, STATUS_DOWN, null, took, msg, endpoint.baseUrl, null);
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