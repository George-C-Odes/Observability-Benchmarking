package com.benchmarking.api;

import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * Health status response for a single service.
 *
 * @param name service name
 * @param status up|down|pending
 * @param statusCode HTTP status code when available
 * @param responseTime response time in milliseconds
 * @param error error message / problem details when available
 * @param url base URL (what the caller/UI should use)
 * @param body optional response body (for debugging)
 */
@Schema(name = "ServiceHealthResponse")
public record ServiceHealthResponse(
  @Schema(description = "Service name")
  String name,

  @Schema(description = "up|down|pending")
  String status,

  @Schema(description = "HTTP status code if available")
  Integer statusCode,

  @Schema(description = "Response time in milliseconds")
  Long responseTime,

  @Schema(description = "Error or problem details")
  String error,

  @Schema(description = "Base URL")
  String url,

  @Schema(description = "(Optional) response body")
  String body
) {
}