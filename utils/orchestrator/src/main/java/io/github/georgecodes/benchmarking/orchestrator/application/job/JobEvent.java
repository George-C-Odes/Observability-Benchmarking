package io.github.georgecodes.benchmarking.orchestrator.application.job;

import java.time.Instant;
import java.util.UUID;
import org.jboss.logging.MDC;

/**
 * Application-layer event emitted during job execution.
 *
 * @param type event type
 * @param stream output stream or system stream
 * @param ts event timestamp
 * @param message event message
 * @param jobId job identifier when present
 * @param jobStatus job lifecycle status when present
 * @param createdAt job creation timestamp when present
 * @param startedAt job start timestamp when present
 * @param finishedAt job finish timestamp when present
 * @param exitCode process exit code when present
 * @param lastLine latest observed log line when present
 * @param requestId request correlation identifier when present
 */
public record JobEvent(
    String type,
    String stream,
    Instant ts,
    String message,
    UUID jobId,
    String jobStatus,
    Instant createdAt,
    Instant startedAt,
    Instant finishedAt,
    Integer exitCode,
    String lastLine,
    String requestId) {

  /**
   * Creates a process log event.
   *
   * @param stream output stream name
   * @param message output message
   * @return log event
   */
  public static JobEvent log(String stream, String message) {
    return new JobEvent(
        "log",
        stream,
        Instant.now(),
        message,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        currentRequestId());
  }

  /**
   * Creates a human-readable status event.
   *
   * @param message status message
   * @return status event
   */
  public static JobEvent status(String message) {
    return new JobEvent(
        "status",
        "system",
        Instant.now(),
        message,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        currentRequestId());
  }

  /**
   * Creates a non-terminal snapshot event.
   *
   * @param jobId job identifier
   * @param jobStatus current job status
   * @param createdAt creation timestamp
   * @param startedAt start timestamp
   * @param finishedAt finish timestamp
   * @param exitCode process exit code
   * @param lastLine latest log line
   * @return summary event
   */
  public static JobEvent summary(
      UUID jobId,
      String jobStatus,
      Instant createdAt,
      Instant startedAt,
      Instant finishedAt,
      Integer exitCode,
      String lastLine) {
    return snapshot(
        "summary", jobId, jobStatus, createdAt, startedAt, finishedAt, exitCode, lastLine);
  }

  /**
   * Creates a terminal snapshot event.
   *
   * @param jobId job identifier
   * @param jobStatus terminal job status
   * @param createdAt creation timestamp
   * @param startedAt start timestamp
   * @param finishedAt finish timestamp
   * @param exitCode process exit code
   * @param lastLine latest log line
   * @return terminal summary event
   */
  public static JobEvent terminalSummary(
      UUID jobId,
      String jobStatus,
      Instant createdAt,
      Instant startedAt,
      Instant finishedAt,
      Integer exitCode,
      String lastLine) {
    return snapshot(
        "terminalSummary", jobId, jobStatus, createdAt, startedAt, finishedAt, exitCode, lastLine);
  }

  private static JobEvent snapshot(
      String type,
      UUID jobId,
      String jobStatus,
      Instant createdAt,
      Instant startedAt,
      Instant finishedAt,
      Integer exitCode,
      String lastLine) {
    return new JobEvent(
        type,
        "system",
        Instant.now(),
        jobStatus,
        jobId,
        jobStatus,
        createdAt,
        startedAt,
        finishedAt,
        exitCode,
        lastLine,
        currentRequestId());
  }

  private static String currentRequestId() {
    Object requestId = MDC.get("requestId");
    return requestId == null ? null : String.valueOf(requestId);
  }
}
