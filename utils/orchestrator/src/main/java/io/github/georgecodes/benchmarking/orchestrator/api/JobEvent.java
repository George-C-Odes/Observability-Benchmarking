package io.github.georgecodes.benchmarking.orchestrator.api;

import java.time.Instant;
import java.util.UUID;

import io.quarkus.runtime.annotations.RegisterForReflection;

/**
 * Event emitted during job execution for real-time updates.
 *
 * <p>Known {@code type} values:
 * <ul>
 *   <li>{@code log} – stream output line (stdout / stderr)</li>
 *   <li>{@code status} – human-friendly status message for display / debugging</li>
 *   <li>{@code summary} – machine-readable snapshot (queued / running / terminal)</li>
 *   <li>{@code terminalSummary} – machine-readable terminal snapshot</li>
 * </ul>
 *
 * @param type       event type (log | status | summary | terminalSummary)
 * @param stream     stream identifier: stdout | stderr | system
 * @param ts         timestamp when the event was created
 * @param message    event message content
 * @param jobId      job identifier
 * @param jobStatus  job lifecycle status (QUEUED / RUNNING / SUCCEEDED / FAILED / CANCELED)
 * @param createdAt  timestamp when the job was created
 * @param startedAt  timestamp when the job started executing
 * @param finishedAt timestamp when the job finished executing
 * @param exitCode   process exit code
 * @param lastLine   last output line from the job
 * @param requestId  correlation / request identifier (propagated from HTTP request MDC)
 */
@RegisterForReflection
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
  String requestId
) {

  // ── Factory methods ────────────────────────────────────────────

  private static String currentRequestId() {
    try {
      Object v = org.jboss.logging.MDC.get("requestId");
      return v != null ? String.valueOf(v) : null;
    } catch (Exception ignored) {
      return null;
    }
  }

  /**
   * Creates a log event from a specific stream.
   *
   * @param stream  the stream (stdout / stderr)
   * @param message the log message
   * @return a new log JobEvent
   */
  public static JobEvent log(String stream, String message) {
    return new JobEvent("log", stream, Instant.now(), message,
      null, null, null, null, null, null, null, currentRequestId());
  }

  /**
   * Creates a status event.
   *
   * @param message the status message
   * @return a new status JobEvent
   */
  public static JobEvent status(String message) {
    return new JobEvent("status", "system", Instant.now(), message,
      null, null, null, null, null, null, null, currentRequestId());
  }

  /**
   * Creates a summary snapshot event (QUEUED / RUNNING / terminal).
   */
  public static JobEvent summary(UUID jobId, String jobStatus,
                                 Instant createdAt, Instant startedAt,
                                 Instant finishedAt, Integer exitCode,
                                 String lastLine) {
    return buildSnapshot("summary", jobId, jobStatus, createdAt, startedAt,
      finishedAt, exitCode, lastLine);
  }

  /**
   * Creates a terminal summary event (SUCCEEDED / FAILED / CANCELED).
   */
  public static JobEvent terminalSummary(UUID jobId, String jobStatus,
                                         Instant createdAt, Instant startedAt,
                                         Instant finishedAt, Integer exitCode,
                                         String lastLine) {
    return buildSnapshot("terminalSummary", jobId, jobStatus, createdAt, startedAt,
      finishedAt, exitCode, lastLine);
  }

  private static JobEvent buildSnapshot(String type, UUID jobId, String jobStatus,
                                        Instant createdAt, Instant startedAt,
                                        Instant finishedAt, Integer exitCode,
                                        String lastLine) {
    return new JobEvent(type, "system", Instant.now(), jobStatus,
      jobId, jobStatus, createdAt, startedAt, finishedAt, exitCode, lastLine,
      currentRequestId());
  }
}
