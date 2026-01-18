package com.benchmarking.application;

import com.benchmarking.api.JobEvent;
import com.benchmarking.api.JobStatusResponse;
import com.benchmarking.application.job.CommandRunner;
import com.benchmarking.application.job.JobEventPublisher;
import com.benchmarking.application.job.JobHeartbeatScheduler;
import com.benchmarking.application.job.JobStore;
import com.benchmarking.application.job.JobTerminalStatus;
import io.smallrye.mutiny.Multi;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import lombok.extern.jbosslog.JBossLog;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.MDC;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicBoolean;

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
   * Job store port used to persist job state and provide SSE event streams.
   */
  @Inject
  JobStore jobStore;

  /**
   * Event publisher port used to publish job events.
   */
  @Inject
  JobEventPublisher eventPublisher;

  /**
   * When true, the orchestrator is already running a job. We reject new submissions
   * to avoid concurrent executions across tabs/sessions.
   */
  private final AtomicBoolean busy = new AtomicBoolean(false);

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

    UUID id = jobStore.create(maxBufferLines, runId);
    executor.submit(() -> runJob(id, cmd));
    return id;
  }

  public void validateRunId(UUID jobId, String runId) {
    jobStore.validateRunId(jobId, runId);
  }

  public JobStatusResponse status(UUID id) {
    return jobStore.status(id);
  }

  public Multi<JobEvent> events(UUID id) {
    return jobStore.events(id);
  }

  private void runJob(UUID jobId, CommandPolicy.ValidatedCommand cmd) {
    MDC.put("jobId", jobId.toString());

    ScheduledFuture<?> heartbeatFuture = null;
    try {
      jobStore.markStarted(jobId, Instant.now());

      heartbeatFuture = scheduleHeartbeat(jobId);

      var result = commandRunner.run(
        cmd.argv(),
        cmd.workspace(),
        Map.of(
          "DOCKER_BUILDKIT", "1",
          "COMPOSE_DOCKER_CLI_BUILD", "1"
        ),
        event -> eventPublisher.publish(jobId, event)
      );

      Status terminal = JobTerminalStatus.from(false, result.exitCode());
      jobStore.markFinished(jobId, terminal.name(), result.finishedAt(), result.exitCode());
    } catch (Exception e) {
      eventPublisher.publish(jobId, JobEvent.status(
        "FAILED exception=" + e.getClass().getSimpleName() + " " + e.getMessage()
      ));
      jobStore.markFinished(jobId, Status.FAILED.name(), Instant.now(), null);
      log.errorf(e, "Job failed jobId=%s", jobId);
    } finally {
      if (heartbeatFuture != null) {
        heartbeatFuture.cancel(true);
      }
      MDC.remove("jobId");
      busy.set(false);
    }
  }

  private ScheduledFuture<?> scheduleHeartbeat(UUID jobId) {
    final long jobStartNanos = System.nanoTime();
    final long[] heartbeatCounter = new long[] { 0L };

    JobHeartbeatScheduler scheduler = new JobHeartbeatScheduler(heartbeatScheduler);

    return scheduler.schedule(heartbeatIntervalMs, () -> {
      try {
        heartbeatCounter[0] += 1;
        long uptimeMs = (System.nanoTime() - jobStartNanos) / 1_000_000L;

        eventPublisher.publish(jobId, JobEvent.status(
          ": heartbeat #" + heartbeatCounter[0] + " uptimeMs=" + uptimeMs
        ));
      } catch (Exception ignored) {
        // ignored
      }
    });
  }
}
