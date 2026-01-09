package com.benchmarking.api;

import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * Health status response for a single service.
 */
@Schema(name = "ServiceHealthResponse")
public record ServiceHealthResponse(
  @Schema(description = "Service name")
  String name,

  @Schema(description = "up|down")
  String status,

  @Schema(description = "HTTP status code if available")
  Integer statusCode,

  @Schema(description = "Response time in milliseconds")
  Long responseTime,

  @Schema(description = "Error or problem details")
  String error,

  @Schema(description = "URL")
  String url,

  @Schema(description = "(Optional) response body")
  String body
) {
}