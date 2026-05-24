package io.github.georgecodes.benchmarking.orchestrator.application.health;

import java.util.List;

/**
 * Application-layer aggregate health result.
 *
 * @param services service health results
 */
public record HealthAggregate(List<ServiceHealth> services) {

  /**
   * Creates an immutable aggregate health result.
   *
   * @param services service health results
   */
  public HealthAggregate {
    services = List.copyOf(services);
  }
}
