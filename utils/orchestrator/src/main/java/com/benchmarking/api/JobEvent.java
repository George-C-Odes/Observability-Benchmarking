package com.benchmarking.api;

import java.time.Instant;
import java.util.UUID;

/**
 * Event emitted during job execution for real-time updates.
 */
public class JobEvent {
  /**
   * Event type.
   *
   * <p>Known values:
   * <ul>
   *   <li>log: stream output line (stdout/stderr)</li>
   *   <li>status: human-friendly status message for display/debugging</li>
   *   <li>summary: machine-readable snapshot (queued/running/terminal)</li>
   *   <li>terminalSummary: machine-readable terminal snapshot</li>
   * </ul>
   */
  private String type;

  /**
   * Stream identifier: stdout | stderr | system.
   */
  private String stream;

  /**
   * Timestamp when the event was created.
   */
  private Instant ts;

  /**
   * Event message content.
   */
  private String message;

  /**
   * Job identifier.
   */
  private UUID jobId;

  /**
   * Job lifecycle status (QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED).
   */
  private String jobStatus;

  /**
   * Timestamp when job was created.
   */
  private Instant createdAt;

  /**
   * Timestamp when job started executing.
   */
  private Instant startedAt;

  /**
   * Timestamp when job finished executing.
   */
  private Instant finishedAt;

  /**
   * Process exit code.
   */
  private Integer exitCode;

  /**
   * Last output line from the job.
   */
  private String lastLine;

  /**
   * Correlation/request identifier (propagated from HTTP request MDC when available).
   * Useful for tying SSE events back to orchestrator logs.
   */
  private String requestId;

  /**
   * Default constructor for JobEvent.
   */
  public JobEvent() {
  }

  /**
   * Gets the event type.
   *
   * @return the event type
   */
  public String getType() {
    return type;
  }

  /**
   * Sets the event type.
   *
   * @param type the event type
   */
  public void setType(String type) {
    this.type = type;
  }

  /**
   * Gets the stream identifier.
   *
   * @return the stream identifier
   */
  public String getStream() {
    return stream;
  }

  /**
   * Sets the stream identifier.
   *
   * @param stream the stream identifier
   */
  public void setStream(String stream) {
    this.stream = stream;
  }

  /**
   * Gets the timestamp.
   *
   * @return the timestamp
   */
  public Instant getTs() {
    return ts;
  }

  /**
   * Sets the timestamp.
   *
   * @param ts the timestamp
   */
  public void setTs(Instant ts) {
    this.ts = ts;
  }

  /**
   * Gets the message.
   *
   * @return the message
   */
  public String getMessage() {
    return message;
  }

  /**
   * Sets the message.
   *
   * @param message the message
   */
  public void setMessage(String message) {
    this.message = message;
  }

  /**
   * Gets job id.
   *
   * @return job id
   */
  public UUID getJobId() {
    return jobId;
  }

  /**
   * Sets job id.
   *
   * @param jobId job id
   */
  public void setJobId(UUID jobId) {
    this.jobId = jobId;
  }

  /**
   * Gets the job lifecycle status.
   *
   * @return job lifecycle status
   */
  public String getJobStatus() {
    return jobStatus;
  }

  /**
   * Sets the job lifecycle status.
   *
   * @param jobStatus job lifecycle status
   */
  public void setJobStatus(String jobStatus) {
    this.jobStatus = jobStatus;
  }

  /**
   * Gets createdAt.
   *
   * @return createdAt
   */
  public Instant getCreatedAt() {
    return createdAt;
  }

  /**
   * Sets createdAt.
   *
   * @param createdAt createdAt
   */
  public void setCreatedAt(Instant createdAt) {
    this.createdAt = createdAt;
  }

  /**
   * Gets startedAt.
   *
   * @return startedAt
   */
  public Instant getStartedAt() {
    return startedAt;
  }

  /**
   * Sets startedAt.
   *
   * @param startedAt startedAt
   */
  public void setStartedAt(Instant startedAt) {
    this.startedAt = startedAt;
  }

  /**
   * Gets finishedAt.
   *
   * @return finishedAt
   */
  public Instant getFinishedAt() {
    return finishedAt;
  }

  /**
   * Sets finishedAt.
   *
   * @param finishedAt finishedAt
   */
  public void setFinishedAt(Instant finishedAt) {
    this.finishedAt = finishedAt;
  }

  /**
   * Gets exitCode.
   *
   * @return exitCode
   */
  public Integer getExitCode() {
    return exitCode;
  }

  /**
   * Sets exitCode.
   *
   * @param exitCode exitCode
   */
  public void setExitCode(Integer exitCode) {
    this.exitCode = exitCode;
  }

  /**
   * Gets lastLine.
   *
   * @return lastLine
   */
  public String getLastLine() {
    return lastLine;
  }

  /**
   * Sets lastLine.
   *
   * @param lastLine lastLine
   */
  public void setLastLine(String lastLine) {
    this.lastLine = lastLine;
  }

  /**
   * Gets the request ID.
   *
   * @return the request ID
   */
  public String getRequestId() {
    return requestId;
  }

  /**
   * Sets the request ID.
   *
   * @param requestId the request ID
   */
  public void setRequestId(String requestId) {
    this.requestId = requestId;
  }

  private static String currentRequestId() {
    try {
      // MicroProfile/Quarkus commonly stores the request id in MDC.
      // If absent, it's fine; the field will be null.
      Object v = org.jboss.logging.MDC.get("requestId");
      return v != null ? String.valueOf(v) : null;
    } catch (Exception ignored) {
      return null;
    }
  }

  /**
   * Creates a log event from a specific stream.
   *
   * @param stream the stream (stdout/stderr)
   * @param message the log message
   * @return a new log JobEvent
   */
  public static JobEvent log(String stream, String message) {
    JobEvent e = new JobEvent();
    e.setRequestId(currentRequestId());
    e.setType("log");
    e.setStream(stream);
    e.setTs(Instant.now());
    e.setMessage(message);
    return e;
  }

  /**
   * Creates a status event.
   *
   * @param message the status message
   * @return a new status JobEvent
   */
  public static JobEvent status(String message) {
    JobEvent e = new JobEvent();
    e.setRequestId(currentRequestId());
    e.setType("status");
    e.setStream("system");
    e.setTs(Instant.now());
    e.setMessage(message);
    return e;
  }

  /**
   * Creates a summary snapshot event (QUEUED/RUNNING/terminal). This is a structured event intended
   * for UIs to render rich state without additional polling.
   */
  public static JobEvent summary(UUID jobId,
                                String jobStatus,
                                Instant createdAt,
                                Instant startedAt,
                                Instant finishedAt,
                                Integer exitCode,
                                String lastLine) {
    JobEvent e = new JobEvent();
    e.setRequestId(currentRequestId());
    e.setType("summary");
    e.setStream("system");
    e.setTs(Instant.now());
    e.setMessage(jobStatus);
    e.setJobId(jobId);
    e.setJobStatus(jobStatus);
    e.setCreatedAt(createdAt);
    e.setStartedAt(startedAt);
    e.setFinishedAt(finishedAt);
    e.setExitCode(exitCode);
    e.setLastLine(lastLine);
    return e;
  }

  /**
   * Creates a terminal summary event (SUCCEEDED/FAILED/CANCELED). This is a structured event
   * intended for UIs to build rich completion summaries without additional polling.
   */
  public static JobEvent terminalSummary(UUID jobId,
                                        String jobStatus,
                                        Instant createdAt,
                                        Instant startedAt,
                                        Instant finishedAt,
                                        Integer exitCode,
                                        String lastLine) {
    JobEvent e = new JobEvent();
    e.setRequestId(currentRequestId());
    e.setType("terminalSummary");
    e.setStream("system");
    e.setTs(Instant.now());
    e.setMessage(jobStatus);
    e.setJobId(jobId);
    e.setJobStatus(jobStatus);
    e.setCreatedAt(createdAt);
    e.setStartedAt(startedAt);
    e.setFinishedAt(finishedAt);
    e.setExitCode(exitCode);
    e.setLastLine(lastLine);
    return e;
  }
}
