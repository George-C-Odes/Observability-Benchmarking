package com.benchmarking.application;

import com.benchmarking.api.JobEvent;
import com.benchmarking.api.JobStatusResponse;
import com.benchmarking.application.job.CommandRunner;
import com.benchmarking.application.job.JobHeartbeatScheduler;
import com.benchmarking.application.job.JobTerminalStatus;
import lombok.extern.jbosslog.JBossLog;
import org.jboss.logging.MDC;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicBoolean;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.MultiEmitter;

@JBossLog
@ApplicationScoped
public class JobManager {

  /**
   * Job execution status.
   */
  public enum Status {
    /** Job is queued for execution. */
    QUEUED,
    /** Job is currently running. */
    RUNNING,
    /** Job completed successfully. */
    SUCCEEDED,
    /** Job failed with an error. */
    FAILED,
    /** Job was canceled. */
    CANCELED
  }

  /**
   * Maximum number of lines to buffer per job.
   */
  @ConfigProperty(name = "orchestrator.max-buffer-lines")
  int maxBufferLines;

  /**
   * Heartbeat (SSE keepalive) interval.
   */
  @ConfigProperty(name = "orchestrator.heartbeat.interval-ms")
  long heartbeatIntervalMs;

  /**
   * Executor service for running jobs.
   */
  private final ExecutorService executor;
  
  /**
   * Map of active jobs by ID.
   */
  private final ConcurrentMap<UUID, Job> jobs = new ConcurrentHashMap<>();

  /**
   * Scheduler for periodic heartbeat events (keeps SSE connections alive).
   */
  private final ScheduledExecutorService heartbeatScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
    Thread t = new Thread(r, "orchestrator-heartbeats");
    t.setDaemon(true);
    return t;
  });

  /**
   * Command runner port used to execute validated commands.
   */
  @Inject
  CommandRunner commandRunner;

  /**
   * When true, the orchestrator is already running a job. We reject new submissions
   * to avoid concurrent executions across tabs/sessions.
   */
  private final AtomicBoolean busy = new AtomicBoolean(false);

  /**
   * Optional mapping of jobId -> runId as provided by the dashboard.
   * Used to prevent cross-run job/status/event mixing.
   */
  private final ConcurrentMap<UUID, String> jobRunIds = new ConcurrentHashMap<>();

  public JobManager() {
    this.executor = Executors.newSingleThreadExecutor(r -> {
      Thread t = new Thread(r, "orchestrator-job-runner");
      t.setDaemon(true);
      return t;
    });
  }

  /**
   * Submits a command for asynchronous execution.
   *
   * @param cmd the validated command
   * @param runId optional dashboard run identifier
   * @return job id
   */
  public UUID submit(CommandPolicy.ValidatedCommand cmd, String runId) {
    if (!busy.compareAndSet(false, true)) {
      throw new jakarta.ws.rs.ServiceUnavailableException("Orchestrator is busy running another job");
    }
    
    UUID id = UUID.randomUUID();
    Job job = new Job(id, maxBufferLines);
    jobs.put(id, job);
    if (runId != null && !runId.isBlank()) {
      jobRunIds.put(id, runId);
    }
    job.emit(JobEvent.status("QUEUED"));
    job.emit(JobEvent.summary(job.id,
      Status.QUEUED.name(),
      job.createdAt,
      job.startedAt,
      job.finishedAt,
      job.exitCode,
      job.lastLine
    ));
    executor.submit(() -> runJob(job, cmd));
    return id;
  }

  /**
   * Validates that the given runId matches the runId bound to this job.
   *
   * @param jobId the job id
   * @param runId the run id (may be null)
   * @throws jakarta.ws.rs.ClientErrorException with 409 on mismatch
   */
  public void validateRunId(UUID jobId, String runId) {
    if (runId == null || runId.isBlank()) {
      return;
    }
    String expected = jobRunIds.get(jobId);
    if (expected == null) {
      // job existed but wasn't created with a runId; treat run-scoped request as stale/mismatch
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

  public JobStatusResponse status(UUID id) {
    return get(id).toStatus();
  }

  public Multi<JobEvent> events(UUID id) {
    return get(id).multi();
  }

  private Job get(UUID id) {
    Job j = jobs.get(id);
    if (j == null) {
      throw new IllegalArgumentException("Unknown jobId: " + id);
    }
    return j;
  }

  private void runJob(
    Job job, CommandPolicy.ValidatedCommand cmd
  ) {
    MDC.put("jobId", job.id.toString());

    ScheduledFuture<?> heartbeatFuture = null;
    try {
      start(job);

      heartbeatFuture = scheduleHeartbeat(job);

      var result = commandRunner.run(
        cmd.argv(),
        cmd.workspace(),
        Map.of(
          "DOCKER_BUILDKIT", "1",
          "COMPOSE_DOCKER_CLI_BUILD", "1"
        ),
        job::emit
      );

      finish(job, result.exitCode(), result.finishedAt());
    } catch (Exception e) {
      fail(job, e);
    } finally {
      if (heartbeatFuture != null) {
        heartbeatFuture.cancel(true);
      }
      MDC.remove("jobId");
      busy.set(false);
    }
  }

  private void start(Job job) {
    job.status = Status.RUNNING;
    job.startedAt = Instant.now();

    job.emit(JobEvent.status("RUNNING"));
    emitSummary(job);
  }

  private ScheduledFuture<?> scheduleHeartbeat(Job job) {
    final long jobStartNanos = System.nanoTime();
    final long[] heartbeatCounter = new long[] {0L};

    JobHeartbeatScheduler scheduler = new JobHeartbeatScheduler(heartbeatScheduler);

    return scheduler.schedule(heartbeatIntervalMs, () -> {
      try {
        if (!job.completed && (job.status == Status.RUNNING || job.status == Status.QUEUED)) {
          heartbeatCounter[0] += 1;
          long uptimeMs = (System.nanoTime() - jobStartNanos) / 1_000_000L;
          int subscribers = job.emitters.size();
          int buffered = job.buffer.size();

          job.emit(JobEvent.status(
            ": heartbeat #" + heartbeatCounter[0] + " status=" + job.status.name() + " uptimeMs=" + uptimeMs
          ));

          log.infof(
            "Heartbeat #%d status=%s uptimeMs=%d subscribers=%d buffered=%d",
            heartbeatCounter[0], job.status, uptimeMs, subscribers, buffered
          );
        }
      } catch (Exception ignored) {
        // Intentionally ignored
      }
    });
  }

  private void finish(Job job, int exitCode, Instant finishedAt) {
    job.exitCode = exitCode;
    job.finishedAt = finishedAt;

    job.status = JobTerminalStatus.from(job.canceled, exitCode);

    switch (job.status) {
      case CANCELED -> job.emit(JobEvent.status("CANCELED"));
      case SUCCEEDED -> job.emit(JobEvent.status("SUCCEEDED"));
      case FAILED -> job.emit(JobEvent.status("FAILED exitCode=" + exitCode));
      default -> job.emit(JobEvent.status(job.status.name()));
    }

    emitSummary(job);
    emitTerminalSummary(job);

    log.infof("Finished status=%s exitCode=%s", job.status, exitCode);
    job.complete();
  }

  private void fail(Job job, Exception e) {
    job.finishedAt = Instant.now();
    job.status = Status.FAILED;

    String msg = "FAILED exception=" + e.getClass().getSimpleName() + " " + e.getMessage();
    job.emit(JobEvent.status(msg));

    emitSummary(job);
    emitTerminalSummary(job);

    log.error(msg, e);
    job.complete();
  }

  private static void emitSummary(Job job) {
    job.emit(JobEvent.summary(
      job.id,
      job.status.name(),
      job.createdAt,
      job.startedAt,
      job.finishedAt,
      job.exitCode,
      job.lastLine
    ));
  }

  private static void emitTerminalSummary(Job job) {
    job.emit(JobEvent.terminalSummary(
      job.id,
      job.status.name(),
      job.createdAt,
      job.startedAt,
      job.finishedAt,
      job.exitCode,
      job.lastLine
    ));
  }

  /**
   * Internal representation of a job with its state and event streaming capabilities.
   */
  static final class Job {
    /**
     * Unique job identifier.
     */
    final UUID id;
    
    /**
     * Current job status.
     */
    volatile Status status = Status.QUEUED;
    
    /**
     * Timestamp when job was created.
     */
    volatile Instant createdAt = Instant.now();
    
    /**
     * Timestamp when job started executing.
     */
    volatile Instant startedAt;
    
    /**
     * Timestamp when job finished executing.
     */
    volatile Instant finishedAt;
    
    /**
     * Process exit code.
     */
    volatile Integer exitCode;
    
    /**
     * Cancellation flag.
     */
    volatile boolean canceled = false;

    /**
     * Event buffer for replay to new subscribers.
     */
    final Deque<JobEvent> buffer;
    
    /**
     * Maximum lines to keep in buffer.
     */
    final int maxLines;

    /**
     * Active event emitters.
     */
    final CopyOnWriteArrayList<MultiEmitter<? super JobEvent>> emitters = new CopyOnWriteArrayList<>();
    
    /**
     * Job completion flag.
     */
    volatile boolean completed = false;
    
    /**
     * Last output line from the job.
     */
    volatile String lastLine = null;

    /**
     * Creates a new job.
     *
     * @param id the job identifier
     * @param maxLines maximum lines to buffer
     */
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
          // Intentionally ignored
        }
      }
    }

    void complete() {
      completed = true;
      for (var em : emitters) {
        try {
          em.complete();
        } catch (Exception ignored) {
          // Intentionally ignored
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
        status.name(),
        createdAt,
        startedAt,
        finishedAt,
        exitCode,
        lastLine
      );
    }
  }
}
