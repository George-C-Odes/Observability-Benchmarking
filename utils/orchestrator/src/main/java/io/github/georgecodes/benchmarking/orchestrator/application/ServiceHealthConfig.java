package io.github.georgecodes.benchmarking.orchestrator.application;

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

  /**
   * Returns the request timeout used for each health probe.
   *
   * @return the health-check timeout in milliseconds
   */
  @WithDefault("10000")
  long timeoutMs();

  /**
   * Returns the maximum number of concurrent health probes to run.
   *
   * @return the configured concurrency limit
   */
  @WithDefault("8")
  int concurrency();

  /**
   * Pluggable health checks.
   *
   * <p>YAML shape:
   *
   * <pre>
   * orchestrator:
   *   health:
   *     services:
   *       grafana:
   *         base-url: <a href="http://grafana:3000">...</a>
   *         health-path: /api/health
   * </pre>
   *
   * @return the configured service health definitions keyed by service name
   */
  @WithDefault("{}")
  Map<String, Service> services();

  /** Nested configuration for an individual service health check. */
  interface Service {
    /**
     * Returns the base URL for the service health probe.
     *
     * @return the optional base URL for the service
     */
    Optional<String> baseUrl();

    /**
     * Returns the relative health endpoint path for the service.
     *
     * @return the health endpoint path, defaulting to {@code /ready}
     */
    @WithDefault("/ready")
    String healthPath();
  }
}
