package com.benchmarking.api;

import java.time.Instant;
import java.util.UUID;

/**
 * Response object representing the status of an orchestrator job.
 *
 * @param jobId unique job identifier
 * @param status current job status (QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELED)
 * @param createdAt timestamp when the job was created
 * @param startedAt timestamp when the job started execution (may be null)
 * @param finishedAt timestamp when the job finished execution (may be null)
 * @param exitCode process exit code (null if not finished)
 * @param lastLine last output line from the job (may be null)
 */
public record JobStatusResponse(
  UUID jobId,
  String status,
  Instant createdAt,
  Instant startedAt,
  Instant finishedAt,
  Integer exitCode,
  String lastLine
) {
}
