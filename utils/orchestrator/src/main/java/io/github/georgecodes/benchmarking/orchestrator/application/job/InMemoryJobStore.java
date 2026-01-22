package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import io.github.georgecodes.benchmarking.orchestrator.api.JobStatusResponse;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.MultiEmitter;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * In-memory adapter for {@link JobStore}.
 */
@ApplicationScoped
public class InMemoryJobStore implements JobStore {

  /**
   * In-memory job storage.
   */
  private final ConcurrentMap<UUID, Job> jobs = new ConcurrentHashMap<>();

  /**
   * Associates job IDs with dashboard run IDs to prevent cross-run mixing.
   */
  private final ConcurrentMap<UUID, String> jobRunIds = new ConcurrentHashMap<>();

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

  @Override
  public JobStatusResponse status(UUID jobId) {
    return get(jobId).toStatus();
  }

  @Override
  public Multi<JobEvent> events(UUID jobId) {
    return get(jobId).multi();
  }

  @Override
  public void emit(UUID jobId, JobEvent event) {
    get(jobId).emit(event);
  }

  @Override
  public void markStarted(UUID jobId, Instant startedAt) {
    Job job = get(jobId);
    job.status = "RUNNING";
    job.startedAt = startedAt;
    emit(jobId, JobEvent.status("RUNNING"));
    emitSnapshot(jobId);
  }

  @Override
  public void markFinished(UUID jobId, String status, Instant finishedAt, Integer exitCode) {
    Job job = get(jobId);
    job.status = status;
    job.finishedAt = finishedAt;
    job.exitCode = exitCode;

    if (status != null && status.startsWith("FAILED") && (job.exitCode == null)) {
      emit(jobId, JobEvent.status(status));
    } else {
      emit(jobId, JobEvent.status(status));
    }

    emitSnapshot(jobId);
    emitTerminalSnapshot(jobId);

    job.complete();
  }

  @Override
  public void validateRunId(UUID jobId, String runId) {
    if (runId == null || runId.isBlank()) {
      return;
    }

    String expected = jobRunIds.get(jobId);
    if (expected == null) {
      throw new jakarta.ws.rs.ClientErrorException(
        jakarta.ws.rs.core.Response.status(409)
          .entity("{\"error\":\"stale_run\",\"message\":\"Job is not bound to this run\"}")
          .type(jakarta.ws.rs.core.MediaType.APPLICATION_JSON)
          .build()
      );
    }
    if (!expected.equals(runId)) {
      throw new jakarta.ws.rs.ClientErrorException(
        jakarta.ws.rs.core.Response.status(409)
          .entity("{\"error\":\"stale_run\",\"message\":\"runId does not match job\"}")
          .type(jakarta.ws.rs.core.MediaType.APPLICATION_JSON)
          .build()
      );
    }
  }

  private void emitSnapshot(UUID jobId) {
    Job job = get(jobId);
    emit(jobId, JobEvent.summary(
      job.id,
      job.status,
      job.createdAt,
      job.startedAt,
      job.finishedAt,
      job.exitCode,
      job.lastLine
    ));
  }

  private void emitTerminalSnapshot(UUID jobId) {
    Job job = get(jobId);
    emit(jobId, JobEvent.terminalSummary(
      job.id,
      job.status,
      job.createdAt,
      job.startedAt,
      job.finishedAt,
      job.exitCode,
      job.lastLine
    ));
  }

  private Job get(UUID id) {
    Job j = jobs.get(id);
    if (j == null) {
      throw new IllegalArgumentException("Unknown jobId: " + id);
    }
    return j;
  }

  static final class Job {

    /** Job identifier. */
    final UUID id;

    /** Current status (e.g. QUEUED/RUNNING/SUCCEEDED/FAILED). */
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
    final CopyOnWriteArrayList<MultiEmitter<? super JobEvent>> emitters = new CopyOnWriteArrayList<>();

    /** Whether the job has reached a terminal state and completed streaming. */
    volatile boolean completed = false;

    /** Last log line observed (if any). */
    volatile String lastLine = null;

    Job(UUID id, int maxLines) {
      this.id = id;
      this.maxLines = Math.max(100, maxLines);
      this.buffer = new ArrayDeque<>(this.maxLines);
    }

    synchronized void addToBuffer(JobEvent e) {
      if ("log".equals(e.getType()) && e.getMessage() != null) {
        lastLine = e.getMessage();
      }
      if (buffer.size() >= maxLines) {
        buffer.removeFirst();
      }
      buffer.addLast(e);
    }

    void emit(JobEvent e) {
      addToBuffer(e);
      for (var em : emitters) {
        try {
          em.emit(e);
        } catch (Exception ignored) {
          // ignored
        }
      }
    }

    void complete() {
      completed = true;
      for (var em : emitters) {
        try {
          em.complete();
        } catch (Exception ignored) {
          // ignored
        }
      }
    }

    Multi<JobEvent> multi() {
      return Multi.createFrom().emitter(em -> {
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

    JobStatusResponse toStatus() {
      return new JobStatusResponse(
        id,
        status,
        createdAt,
        startedAt,
        finishedAt,
        exitCode,
        lastLine
      );
    }
  }
}
