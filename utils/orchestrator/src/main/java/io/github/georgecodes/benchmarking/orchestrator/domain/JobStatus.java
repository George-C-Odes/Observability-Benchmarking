package io.github.georgecodes.benchmarking.orchestrator.domain;

/**
 * Job execution lifecycle status.
 */
public enum JobStatus {
  /** Job is queued for execution. */
  @SuppressWarnings("unused")
  QUEUED,
  /** Job is currently running. */
  @SuppressWarnings("unused")
  RUNNING,
  /** Job completed successfully. */
  SUCCEEDED,
  /** Job failed with an error. */
  FAILED,
  /** Job was canceled. */
  CANCELED
}