package com.benchmarking.api;

import java.util.UUID;

/**
 * Response containing the job ID for an async command execution.
 *
 * @param jobId the unique identifier of the created job
 * @param runId the run identifier bound to this job (if provided by the client)
 */
public record RunResponse(
  UUID jobId,
  String runId
) {
}
