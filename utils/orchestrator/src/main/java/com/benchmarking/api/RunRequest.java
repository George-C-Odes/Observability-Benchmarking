package com.benchmarking.api;

import jakarta.validation.constraints.NotBlank;

/**
 * Request to run a command via the orchestrator.
 *
 * @param command the command to execute
 * @param runId optional client-provided run identifier used to correlate dashboard sessions
 */
public record RunRequest(
  @NotBlank
  String command,
  String runId
) {
}
