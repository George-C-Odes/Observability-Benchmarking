package com.benchmarking.service;

import com.benchmarking.api.HealthAggregateResponse;
import com.benchmarking.api.ServiceHealthResponse;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Aggregates health/readiness checks for the docker-compose stack.
 * This belongs in the orchestrator (backend), so browser/mobile clients don't need to know
 * internal docker DNS names.
 */
@ApplicationScoped
public class ServiceHealthService {

  private final java.net.http.HttpClient client;

  @ConfigProperty(name = "orchestrator.health.timeout-ms", defaultValue = "10000")
  long defaultTimeoutMs;

  public ServiceHealthService() {
    this.client = java.net.http.HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(10))
      .build();
  }

  private record Endpoint(String name, String url, long timeoutMs) {}

  private List<Endpoint> endpoints() {
    // Keep in sync with the former Next.js aggregation list.
    return List.of(
      // Observability
      new Endpoint("grafana", "http://grafana:3000/api/health", defaultTimeoutMs),
      new Endpoint("alloy", "http://alloy:12345/-/ready", defaultTimeoutMs),
      new Endpoint("loki", "http://loki:3100/ready", defaultTimeoutMs),
      new Endpoint("mimir", "http://mimir:9009/ready", defaultTimeoutMs),
      new Endpoint("tempo", "http://tempo:3200/ready", defaultTimeoutMs),
      new Endpoint("pyroscope", "http://pyroscope:4040/ready", defaultTimeoutMs),

      // Spring
      new Endpoint("spring-jvm-tomcat-platform", "http://spring-jvm-tomcat-platform:8080/actuator/health/readiness", defaultTimeoutMs),
      new Endpoint("spring-jvm-tomcat-virtual", "http://spring-jvm-tomcat-virtual:8080/actuator/health/readiness", defaultTimeoutMs),
      new Endpoint("spring-jvm-netty", "http://spring-jvm-netty:8080/actuator/health/readiness", defaultTimeoutMs),
      new Endpoint("spring-native-tomcat-platform", "http://spring-native-tomcat-platform:8080/actuator/health/readiness", defaultTimeoutMs),
      new Endpoint("spring-native-tomcat-virtual", "http://spring-native-tomcat-virtual:8080/actuator/health/readiness", defaultTimeoutMs),
      new Endpoint("spring-native-netty", "http://spring-native-netty:8080/actuator/health/readiness", defaultTimeoutMs),

      // Quarkus
      new Endpoint("quarkus-jvm", "http://quarkus-jvm:8080/q/health/ready", defaultTimeoutMs),
      new Endpoint("quarkus-native", "http://quarkus-native:8080/q/health/ready", defaultTimeoutMs),

      // Go
      new Endpoint("go", "http://go:8080/readyz", defaultTimeoutMs),

      // Utils
      new Endpoint("nextjs-dash", "http://nextjs-dash:3001/api/app-health", defaultTimeoutMs),
      new Endpoint("orchestrator", "http://orchestrator:3002/q/health/ready", defaultTimeoutMs)
    );
  }

  public Uni<HealthAggregateResponse> checkAll(Optional<String> onlyService) {
    final List<Endpoint> selected = onlyService
      .map(name -> endpoints().stream().filter(e -> e.name.equals(name)).toList())
      .orElseGet(this::endpoints);

    return Uni.createFrom().item(() -> {
      List<ServiceHealthResponse> results = new ArrayList<>();
      for (Endpoint e : selected) {
        results.add(checkOneBlocking(e));
      }
      return new HealthAggregateResponse(results);
    });
  }

  private ServiceHealthResponse checkOneBlocking(Endpoint endpoint) {
    long start = System.currentTimeMillis();
    long timeoutMs = endpoint.timeoutMs > 0 ? endpoint.timeoutMs : defaultTimeoutMs;

    try {
      HttpRequest req = HttpRequest.newBuilder()
        .uri(URI.create(endpoint.url))
        .timeout(Duration.ofMillis(timeoutMs))
        .GET()
        .build();

      HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
      long took = System.currentTimeMillis() - start;

      if (resp.statusCode() >= 200 && resp.statusCode() < 300) {
        return new ServiceHealthResponse(endpoint.name, "up", resp.statusCode(), took, null, endpoint.url, resp.body());
      }

      return new ServiceHealthResponse(endpoint.name, "down", resp.statusCode(), took, "HTTP " + resp.statusCode(), endpoint.url, resp.body());
    } catch (Exception ex) {
      long took = System.currentTimeMillis() - start;
      return new ServiceHealthResponse(endpoint.name, "down", null, took, ex.getMessage(), endpoint.url, null);
    }
  }
}