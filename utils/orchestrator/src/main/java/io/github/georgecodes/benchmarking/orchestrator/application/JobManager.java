package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import io.github.georgecodes.benchmarking.orchestrator.api.JobStatusResponse;
import io.github.georgecodes.benchmarking.orchestrator.application.job.CommandRunner;
import io.github.georgecodes.benchmarking.orchestrator.application.job.HeartbeatScheduler;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobAdmissionPolicy;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobEventPublisher;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobStore;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobTerminalStatus;
import io.github.georgecodes.benchmarking.orchestrator.domain.JobStatus;
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

@JBossLog
@ApplicationScoped
public class JobManager {

  /** Maximum number of lines to buffer per job. */
  private final int maxBufferLines;

  /** Heartbeat (SSE keepalive) interval. */
  private final long heartbeatIntervalMs;

  /** Executor service for running jobs. */
  private final ExecutorService executor;

  /** Heartbeat scheduler port. */
  private final HeartbeatScheduler heartbeatScheduler;

  /** Admission policy port for controlling concurrent submissions. */
  private final JobAdmissionPolicy admissionPolicy;

  /** Command runner port used to execute validated commands. */
  private final CommandRunner commandRunner;

  /** Job store port used to persist job state and provide SSE event streams. */
  private final JobStore jobStore;

  /** Event publisher port used to publish job events. */
  private final JobEventPublisher eventPublisher;

  @Inject
  public JobManager(
    @ConfigProperty(name = "orchestrator.max-buffer-lines") int maxBufferLines,
    @ConfigProperty(name = "orchestrator.heartbeat.interval-ms") long heartbeatIntervalMs,
    HeartbeatScheduler heartbeatScheduler,
    JobAdmissionPolicy admissionPolicy,
    CommandRunner commandRunner,
    JobStore jobStore,
    JobEventPublisher eventPublisher
  ) {
    this.maxBufferLines = maxBufferLines;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.heartbeatScheduler = heartbeatScheduler;
    this.admissionPolicy = admissionPolicy;
    this.commandRunner = commandRunner;
    this.jobStore = jobStore;
    this.eventPublisher = eventPublisher;
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
    JobAdmissionPolicy.Admission admission = admissionPolicy.acquire();
    UUID id = jobStore.create(maxBufferLines, runId);
    executor.submit(() -> runJob(id, cmd, admission));
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

  private void runJob(UUID jobId, CommandPolicy.ValidatedCommand cmd, JobAdmissionPolicy.Admission admission) {
    try (admission) {
      MDC.put("jobId", jobId.toString());

      HeartbeatScheduler.Cancellable heartbeat = null;
      try {
        jobStore.markStarted(jobId, Instant.now());

        heartbeat = scheduleHeartbeat(jobId);

        var result = commandRunner.run(
          cmd.argv(),
          cmd.workspace(),
          Map.of(
            "DOCKER_BUILDKIT", "1",
            "COMPOSE_DOCKER_CLI_BUILD", "1"
          ),
          event -> eventPublisher.publish(jobId, event)
        );

        JobStatus terminal = JobTerminalStatus.from(false, result.exitCode());
        jobStore.markFinished(jobId, terminal.name(), result.finishedAt(), result.exitCode());
      } catch (Exception e) {
        eventPublisher.publish(jobId, JobEvent.status(
          "FAILED exception=" + e.getClass().getSimpleName() + " " + e.getMessage()
        ));
        jobStore.markFinished(jobId, JobStatus.FAILED.name(), Instant.now(), null);
        log.errorf(e, "Job failed jobId=%s", jobId);
      } finally {
        if (heartbeat != null) {
          heartbeat.cancel();
        }
        MDC.remove("jobId");
      }
    }
  }

  private HeartbeatScheduler.Cancellable scheduleHeartbeat(UUID jobId) {
    final long jobStartNanos = System.nanoTime();
    final long[] heartbeatCounter = new long[] {0L};

    return heartbeatScheduler.scheduleFixedRate(heartbeatIntervalMs, () -> {
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