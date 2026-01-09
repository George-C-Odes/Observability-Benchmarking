package com.benchmarking.api;

import org.eclipse.microprofile.openapi.annotations.media.Schema;

import java.util.List;

/**
 * Aggregated health response.
 */
@Schema(name = "HealthAggregateResponse")
public record HealthAggregateResponse(
  @Schema(description = "List of service health statuses")
  List<ServiceHealthResponse> services
) {
}