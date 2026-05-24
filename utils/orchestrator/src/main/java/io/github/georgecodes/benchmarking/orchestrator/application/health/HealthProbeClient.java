package io.github.georgecodes.benchmarking.orchestrator.application.health;

import io.smallrye.mutiny.Uni;

/** Port for probing one configured service health endpoint. */
@FunctionalInterface
public interface HealthProbeClient {

  /**
   * Probes one endpoint and returns its health result.
   *
   * @param endpoint endpoint to probe
   * @param timeoutMs request timeout in milliseconds
   * @return asynchronous service health result
   */
  Uni<ServiceHealth> probe(HealthEndpoint endpoint, long timeoutMs);
}
