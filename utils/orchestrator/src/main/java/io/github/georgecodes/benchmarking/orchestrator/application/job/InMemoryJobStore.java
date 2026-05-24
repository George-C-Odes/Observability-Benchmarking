package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.MultiEmitter;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArrayList;
import lombok.extern.jbosslog.JBossLog;

/** In-memory adapter for {@link JobStore}. */
@JBossLog
@ApplicationScoped
public class InMemoryJobStore implements JobStore {

  /** In-memory job storage. */
  private final ConcurrentMap<UUID, Job> jobs = new ConcurrentHashMap<>();

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
    Job job = new Job(id, maxBufferLines);
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
    Job job = get(jobId);
    job.status = "RUNNING";
    job.startedAt = startedAt;
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
    Job job = get(jobId);
    job.status = status;
    job.finishedAt = finishedAt;
    job.exitCode = exitCode;

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
    Job job = get(jobId);
    emit(
        jobId,
        JobEvent.summary(
            job.id,
            job.status,
            job.createdAt,
            job.startedAt,
            job.finishedAt,
            job.exitCode,
            job.lastLine));
  }

  /**
   * Emits a terminal summary snapshot for the given job.
   *
   * @param jobId the job identifier
   */
  private void emitTerminalSnapshot(UUID jobId) {
    Job job = get(jobId);
    emit(
        jobId,
        JobEvent.terminalSummary(
            job.id,
            job.status,
            job.createdAt,
            job.startedAt,
            job.finishedAt,
            job.exitCode,
            job.lastLine));
  }

  /**
   * Returns the in-memory job model for the given identifier.
   *
   * @param id the job identifier
   * @return the tracked in-memory job
   * @throws IllegalArgumentException when the job id is unknown
   */
  private Job get(UUID id) {
    Job j = jobs.get(id);
    if (j == null) {
      throw new IllegalArgumentException("Unknown jobId: " + id);
    }
    return j;
  }

  /** Mutable in-memory job state and SSE subscriber registry for a single running command. */
  static final class Job {

    /** Job identifier. */
    final UUID id;

    /** Current status (e.g., QUEUED/RUNNING/SUCCEEDED/FAILED). */
    volatile String status = "QUEUED";

    /** Job creation time. */
    volatile Instant createdAt = Instant.now();

    /** Job start time (when execution begins). */
    volatile Instant startedAt;

    /** Job finish time (when execution ends). */
    volatile Instant finishedAt;

    /** Process exit code (if available). */
    volatile Integer exitCode;

    /** Buffered events for replay to new subscribers. */
    final Deque<JobEvent> buffer;

    /** Maximum buffered events. */
    final int maxLines;

    /** Active SSE subscribers. */
    final List<MultiEmitter<? super JobEvent>> emitters = new CopyOnWriteArrayList<>();

    /** Whether the job has reached a terminal state and completed streaming. */
    volatile boolean completed;

    /** Last log line observed (if any). */
    volatile String lastLine;

    /**
     * Creates an in-memory job with the requested replay buffer size.
     *
     * @param id the job identifier
     * @param maxLines the requested buffer size
     */
    Job(UUID id, int maxLines) {
      this.id = id;
      this.maxLines = Math.max(100, maxLines);
      this.buffer = new ArrayDeque<>(this.maxLines);
    }

    /**
     * Appends an event to the replay buffer and tracks the latest log line.
     *
     * @param e the event to buffer
     */
    synchronized void addToBuffer(JobEvent e) {
      if ("log".equals(e.type()) && e.message() != null) {
        lastLine = e.message();
      }
      if (buffer.size() >= maxLines) {
        buffer.removeFirst();
      }
      buffer.addLast(e);
    }

    /**
     * Emits an event to all current subscribers after buffering it for replay.
     *
     * @param e the event to emit
     */
    void emit(JobEvent e) {
      addToBuffer(e);
      for (var em : emitters) {
        try {
          em.emit(e);
        } catch (IllegalStateException ex) {
          emitters.remove(em);
          log.tracef("Removed dead emitter for job %s: %s", id, ex.getMessage());
        }
      }
    }

    /** Marks the job as complete and terminates all active subscriber streams. */
    void complete() {
      completed = true;
      for (var em : emitters) {
        try {
          em.complete();
        } catch (IllegalStateException ex) {
          emitters.remove(em);
          log.tracef("Removed dead emitter on complete for job %s: %s", id, ex.getMessage());
        }
      }
    }

    /**
     * Creates a replayable event stream for the buffered and live job events.
     *
     * @return the replayable event stream
     */
    Multi<JobEvent> multi() {
      return Multi.createFrom()
          .emitter(
              em -> {
                synchronized (this) {
                  for (JobEvent e : buffer) {
                    em.emit(e);
                  }
                }
                emitters.add(em);
                em.onTermination(() -> emitters.remove(em));
                if (completed) {
                  em.complete();
                }
              });
    }

    /**
     * Converts the in-memory job state into the API response model.
     *
     * @return the status response snapshot
     */
    JobStatusSnapshot toStatus() {
      return new JobStatusSnapshot(
          id, status, createdAt, startedAt, finishedAt, exitCode, lastLine);
    }
  }
}
