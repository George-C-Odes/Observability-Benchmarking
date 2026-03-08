package io.github.georgecodes.benchmarking.orchestrator.api;

import java.time.Instant;
import java.util.UUID;

import io.quarkus.runtime.annotations.RegisterForReflection;
import lombok.Builder;
import lombok.Value;
import lombok.extern.jackson.Jacksonized;

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
 */
@Value
@Builder
@Jacksonized
@RegisterForReflection
public class JobEvent {

  /** Event type (log | status | summary | terminalSummary). */
  String type;

  /** Stream identifier: stdout | stderr | system. */
  String stream;

  /** Timestamp when the event was created. */
  Instant ts;

  /** Event message content. */
  String message;

  /** Job identifier. */
  UUID jobId;

  /** Job lifecycle status (QUEUED / RUNNING / SUCCEEDED / FAILED / CANCELED). */
  String jobStatus;

  /** Timestamp when job was created. */
  Instant createdAt;

  /** Timestamp when job started executing. */
  Instant startedAt;

  /** Timestamp when job finished executing. */
  Instant finishedAt;

  /** Process exit code. */
  Integer exitCode;

  /** Last output line from the job. */
  String lastLine;

  /**
   * Correlation / request identifier (propagated from HTTP request MDC when available).
   * Useful for tying SSE events back to orchestrator logs.
   */
  String requestId;

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
    return JobEvent.builder()
      .requestId(currentRequestId())
      .type("log")
      .stream(stream)
      .ts(Instant.now())
      .message(message)
      .build();
  }

  /**
   * Creates a status event.
   *
   * @param message the status message
   * @return a new status JobEvent
   */
  public static JobEvent status(String message) {
    return JobEvent.builder()
      .requestId(currentRequestId())
      .type("status")
      .stream("system")
      .ts(Instant.now())
      .message(message)
      .build();
  }

  /**
   * Creates a summary snapshot event (QUEUED / RUNNING / terminal).
   */
  public static JobEvent summary(UUID jobId,
                                 String jobStatus,
                                 Instant createdAt,
                                 Instant startedAt,
                                 Instant finishedAt,
                                 Integer exitCode,
                                 String lastLine) {
    return JobEvent.builder()
      .requestId(currentRequestId())
      .type("summary")
      .stream("system")
      .ts(Instant.now())
      .message(jobStatus)
      .jobId(jobId)
      .jobStatus(jobStatus)
      .createdAt(createdAt)
      .startedAt(startedAt)
      .finishedAt(finishedAt)
      .exitCode(exitCode)
      .lastLine(lastLine)
      .build();
  }

  /**
   * Creates a terminal summary event (SUCCEEDED / FAILED / CANCELED).
   */
  public static JobEvent terminalSummary(UUID jobId,
                                         String jobStatus,
                                         Instant createdAt,
                                         Instant startedAt,
                                         Instant finishedAt,
                                         Integer exitCode,
                                         String lastLine) {
    return JobEvent.builder()
      .requestId(currentRequestId())
      .type("terminalSummary")
      .stream("system")
      .ts(Instant.now())
      .message(jobStatus)
      .jobId(jobId)
      .jobStatus(jobStatus)
      .createdAt(createdAt)
      .startedAt(startedAt)
      .finishedAt(finishedAt)
      .exitCode(exitCode)
      .lastLine(lastLine)
      .build();
  }
}
