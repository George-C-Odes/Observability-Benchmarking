package com.benchmarking.api;

import java.util.UUID;

/**
 * Response containing the job ID for an async command execution.
 */
public class RunResponse {
  /**
   * The unique identifier of the created job.
   */
  private UUID jobId;

  /**
   * The run identifier bound to this job (if provided by the client).
   */
  private String runId;

  /**
   * Creates a new run response.
   *
   * @param jobId the job identifier
   */
  public RunResponse(UUID jobId) {
    this.jobId = jobId;
  }

  /**
   * Creates a new run response.
   *
   * @param jobId the job identifier
   * @param runId the run identifier
   */
  public RunResponse(UUID jobId, String runId) {
    this.jobId = jobId;
    this.runId = runId;
  }

  /**
   * Gets the job identifier.
   *
   * @return the job identifier
   */
  public UUID getJobId() {
    return jobId;
  }

  /**
   * Sets the job identifier.
   *
   * @param jobId the job identifier
   */
  public void setJobId(UUID jobId) {
    this.jobId = jobId;
  }

  /**
   * Gets the run identifier.
   *
   * @return the run identifier
   */
  public String getRunId() {
    return runId;
  }

  /**
   * Sets the run identifier.
   *
   * @param runId the run identifier
   */
  public void setRunId(String runId) {
    this.runId = runId;
  }
}
