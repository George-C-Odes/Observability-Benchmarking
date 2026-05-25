package io.github.georgecodes.benchmarking.orchestrator.api;

import io.github.georgecodes.benchmarking.orchestrator.application.health.HealthAggregate;
import java.util.List;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * Aggregated health response.
 *
 * @param services list of aggregated service health statuses
 */
@Schema(name = "HealthAggregateResponse")
public record HealthAggregateResponse(
    @Schema(description = "List of service health statuses") List<ServiceHealthResponse> services) {

  /**
   * Creates an aggregate response with an immutable snapshot of service health results.
   *
   * @param services the aggregated service health results
   */
  public HealthAggregateResponse {
    services = List.copyOf(services);
  }

  /**
   * Maps an application-layer aggregate health result to the API representation.
   *
   * @param aggregate application-layer aggregate health result
   * @return API aggregate health response
   */
  public static HealthAggregateResponse from(HealthAggregate aggregate) {
    return new HealthAggregateResponse(
        aggregate.services().stream().map(ServiceHealthResponse::from).toList());
  }
}
