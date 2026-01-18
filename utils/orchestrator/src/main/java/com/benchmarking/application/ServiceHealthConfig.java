package com.benchmarking.application;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;

import java.util.Map;
import java.util.Optional;

/**
 * Strongly-typed configuration for orchestrator health aggregation.
 *
 * <p>This uses SmallRye {@link ConfigMapping} so complex types (nested maps) can be loaded from
 * {@code application.yml} without needing a custom converter.
 */
@ConfigMapping(prefix = "orchestrator.health")
public interface ServiceHealthConfig {

  @WithDefault("10000")
  long timeoutMs();

  @WithDefault("8")
  int concurrency();

  /**
   * Pluggable health checks.
   *
   * <p>YAML shape:
   * <pre>
   * orchestrator:
   *   health:
   *     services:
   *       grafana:
   *         base-url: http://grafana:3000
   *         health-path: /api/health
   * </pre>
   */
  @WithDefault("{}")
  Map<String, Service> services();

  interface Service {
    Optional<String> baseUrl();

    /** Optional; if not provided, {@code /ready} is assumed by the service. */
    @WithDefault("/ready")
    String healthPath();
  }
}
