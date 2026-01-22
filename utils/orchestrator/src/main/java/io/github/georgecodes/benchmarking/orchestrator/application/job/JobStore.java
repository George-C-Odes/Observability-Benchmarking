package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import io.github.georgecodes.benchmarking.orchestrator.api.JobStatusResponse;
import io.smallrye.mutiny.Multi;

import java.time.Instant;
import java.util.UUID;

/**
 * Port for storing and querying job state and events.
 */
public interface JobStore {

  /**
   * Creates a new job in QUEUED state.
   *
   * @param maxBufferLines max event lines to retain
   * @param runId optional runId binding
   * @return created job id
   */
  UUID create(int maxBufferLines, String runId);

  /**
   * Returns a snapshot of job status.
   */
  JobStatusResponse status(UUID jobId);

  /**
   * Returns a replayable event stream for the job.
   */
  Multi<JobEvent> events(UUID jobId);

  /**
   * Emits an event for the job and persists/buffers it.
   */
  void emit(UUID jobId, JobEvent event);

  /**
   * Marks a job as started.
   */
  void markStarted(UUID jobId, Instant startedAt);

  /**
   * Marks a job as finished.
   */
  void markFinished(UUID jobId, String status, Instant finishedAt, Integer exitCode);

  /**
   * Validates runId binding.
   *
   * @throws jakarta.ws.rs.ClientErrorException with 409 on mismatch
   */
  void validateRunId(UUID jobId, String runId);
}
