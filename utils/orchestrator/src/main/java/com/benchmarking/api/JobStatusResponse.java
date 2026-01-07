package com.benchmarking.api;

import java.time.Instant;
import java.util.UUID;

/**
 * Response object representing the status of an orchestrator job.
 */
public class JobStatusResponse {
  /**
   * Unique identifier for the job.
   */
  private UUID jobId;
  
  /**
   * Current job status (QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELED).
   */
  private String status;
  
  /**
   * Timestamp when the job was created.
   */
  private Instant createdAt;
  
  /**
   * Timestamp when the job started execution.
   */
  private Instant startedAt;
  
  /**
   * Timestamp when the job finished execution.
   */
  private Instant finishedAt;
  
  /**
   * Exit code of the process (null if not finished).
   */
  private Integer exitCode;
  
  /**
   * Last output line from the job.
   */
  private String lastLine;

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
   * Gets the job status.
   *
   * @return the job status
   */
  public String getStatus() {
    return status;
  }

  /**
   * Sets the job status.
   *
   * @param status the job status
   */
  public void setStatus(String status) {
    this.status = status;
  }

  /**
   * Gets the creation timestamp.
   *
   * @return the creation timestamp
   */
  public Instant getCreatedAt() {
    return createdAt;
  }

  /**
   * Sets the creation timestamp.
   *
   * @param createdAt the creation timestamp
   */
  public void setCreatedAt(Instant createdAt) {
    this.createdAt = createdAt;
  }

  /**
   * Gets the start timestamp.
   *
   * @return the start timestamp
   */
  public Instant getStartedAt() {
    return startedAt;
  }

  /**
   * Sets the start timestamp.
   *
   * @param startedAt the start timestamp
   */
  public void setStartedAt(Instant startedAt) {
    this.startedAt = startedAt;
  }

  /**
   * Gets the finish timestamp.
   *
   * @return the finish timestamp
   */
  public Instant getFinishedAt() {
    return finishedAt;
  }

  /**
   * Sets the finish timestamp.
   *
   * @param finishedAt the finish timestamp
   */
  public void setFinishedAt(Instant finishedAt) {
    this.finishedAt = finishedAt;
  }

  /**
   * Gets the exit code.
   *
   * @return the exit code
   */
  public Integer getExitCode() {
    return exitCode;
  }

  /**
   * Sets the exit code.
   *
   * @param exitCode the exit code
   */
  public void setExitCode(Integer exitCode) {
    this.exitCode = exitCode;
  }

  /**
   * Gets the last output line.
   *
   * @return the last output line
   */
  public String getLastLine() {
    return lastLine;
  }

  /**
   * Sets the last output line.
   *
   * @param lastLine the last output line
   */
  public void setLastLine(String lastLine) {
    this.lastLine = lastLine;
  }
}
