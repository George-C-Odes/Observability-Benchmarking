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
   *
   * @param jobId the job identifier
   * @return the current job status snapshot
   */
  JobStatusResponse status(UUID jobId);

  /**
   * Returns a replayable event stream for the job.
   *
   * @param jobId the job identifier
   * @return the replayable event stream for the job
   */
  Multi<JobEvent> events(UUID jobId);

  /**
   * Emits an event for the job and persists/buffers it.
   *
   * @param jobId the job identifier
   * @param event the event to buffer and publish
   */
  void emit(UUID jobId, JobEvent event);

  /**
   * Marks a job as started.
   *
   * @param jobId the job identifier
   * @param startedAt the timestamp when the job started executing
   */
  void markStarted(UUID jobId, Instant startedAt);

  /**
   * Marks a job as finished.
   *
   * @param jobId the job identifier
   * @param status the terminal job status
   * @param finishedAt the timestamp when the job finished executing
   * @param exitCode the process exit code, if available
   */
  void markFinished(UUID jobId, String status, Instant finishedAt, Integer exitCode);

  /**
   * Validates runId binding.
   *
   * @param jobId the job identifier
   * @param runId the run identifier supplied by the caller
   * @throws jakarta.ws.rs.ClientErrorException with 409 on mismatch
   */
  void validateRunId(UUID jobId, String runId);
}
