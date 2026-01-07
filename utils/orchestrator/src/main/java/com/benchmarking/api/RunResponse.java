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
   * Creates a new run response.
   *
   * @param jobId the job identifier
   */
  public RunResponse(UUID jobId) {
    this.jobId = jobId;
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
}
