package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.smallrye.mutiny.Multi;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/** In-memory adapter for {@link JobStore}. */
@ApplicationScoped
public class InMemoryJobStore implements JobStore {

  /** In-memory job storage. */
  private final ConcurrentMap<UUID, InMemoryJob> jobs = new ConcurrentHashMap<>();

  /** Associates job IDs with dashboard run IDs to prevent cross-run mixing. */
  private final ConcurrentMap<UUID, String> jobRunIds = new ConcurrentHashMap<>();

  /**
   * Creates and registers a new queued job in memory.
   *
   * @param maxBufferLines the requested maximum number of buffered events
   * @param runId the optional dashboard run identifier to bind to the job
   * @return the generated job identifier
   */
  @Override
  public UUID create(int maxBufferLines, String runId) {
    UUID id = UUID.randomUUID();
    InMemoryJob job = new InMemoryJob(id, maxBufferLines);
    jobs.put(id, job);
    if (runId != null && !runId.isBlank()) {
      jobRunIds.put(id, runId);
    }

    emit(id, JobEvent.status("QUEUED"));
    emitSnapshot(id);

    return id;
  }

  /**
   * Returns the current status snapshot for the given job.
   *
   * @param jobId the job identifier
   * @return the current job status snapshot
   */
  @Override
  public JobStatusSnapshot status(UUID jobId) {
    return get(jobId).toStatus();
  }

  /**
   * Returns a replayable event stream for the given job.
   *
   * @param jobId the job identifier
   * @return the event stream associated with the job
   */
  @Override
  public Multi<JobEvent> events(UUID jobId) {
    return get(jobId).multi();
  }

  /**
   * Emits and buffers a new event for the given job.
   *
   * @param jobId the job identifier
   * @param event the event to publish
   */
  @Override
  public void emit(UUID jobId, JobEvent event) {
    get(jobId).emit(event);
  }

  /**
   * Marks the job as started and emits an updated status snapshot.
   *
   * @param jobId the job identifier
   * @param startedAt the timestamp when execution began
   */
  @Override
  public void markStarted(UUID jobId, Instant startedAt) {
    get(jobId).markStarted(startedAt);
    emit(jobId, JobEvent.status("RUNNING"));
    emitSnapshot(jobId);
  }

  /**
   * Marks the job as finished and emits terminal status snapshots.
   *
   * @param jobId the job identifier
   * @param status the terminal status value
   * @param finishedAt the timestamp when execution finished
   * @param exitCode the process exit code, if available
   */
  @Override
  public void markFinished(UUID jobId, String status, Instant finishedAt, Integer exitCode) {
    InMemoryJob job = get(jobId);
    job.markFinished(status, finishedAt, exitCode);

    emit(jobId, JobEvent.status(status));

    emitSnapshot(jobId);
    emitTerminalSnapshot(jobId);

    job.complete();
  }

  /**
   * Validates that the provided run id matches the job binding when one exists.
   *
   * @param jobId the job identifier
   * @param runId the run identifier supplied by the caller
   */
  @Override
  public void validateRunId(UUID jobId, String runId) {
    if (runId == null || runId.isBlank()) {
      return;
    }

    String expected = jobRunIds.get(jobId);
    if (expected == null) {
      throw new JobRunConflictException("stale_run", "Job is not bound to this run");
    }
    if (!expected.equals(runId)) {
      throw new JobRunConflictException("stale_run", "runId does not match job");
    }
  }

  /**
   * Emits a non-terminal summary snapshot for the given job.
   *
   * @param jobId the job identifier
   */
  private void emitSnapshot(UUID jobId) {
    JobStatusSnapshot snapshot = get(jobId).toStatus();
    emit(
        jobId,
        JobEvent.summary(
            snapshot.jobId(),
            snapshot.status(),
            snapshot.createdAt(),
            snapshot.startedAt(),
            snapshot.finishedAt(),
            snapshot.exitCode(),
            snapshot.lastLine()));
  }

  /**
   * Emits a terminal summary snapshot for the given job.
   *
   * @param jobId the job identifier
   */
  private void emitTerminalSnapshot(UUID jobId) {
    JobStatusSnapshot snapshot = get(jobId).toStatus();
    emit(
        jobId,
        JobEvent.terminalSummary(
            snapshot.jobId(),
            snapshot.status(),
            snapshot.createdAt(),
            snapshot.startedAt(),
            snapshot.finishedAt(),
            snapshot.exitCode(),
            snapshot.lastLine()));
  }

  /**
   * Returns the in-memory job model for the given identifier.
   *
   * @param id the job identifier
   * @return the tracked in-memory job
   * @throws IllegalArgumentException when the job id is unknown
   */
  private InMemoryJob get(UUID id) {
    InMemoryJob j = jobs.get(id);
    if (j == null) {
      throw new IllegalArgumentException("Unknown jobId: " + id);
    }
    return j;
  }
}
