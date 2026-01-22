package io.github.georgecodes.benchmarking.orchestrator.api;

import org.eclipse.microprofile.openapi.annotations.media.Schema;

import java.util.List;

/**
 * Aggregated health response.
 *
 * @param services list of aggregated service health statuses
 */
@Schema(name = "HealthAggregateResponse")
public record HealthAggregateResponse(
  @Schema(description = "List of service health statuses")
  List<ServiceHealthResponse> services
) {
}