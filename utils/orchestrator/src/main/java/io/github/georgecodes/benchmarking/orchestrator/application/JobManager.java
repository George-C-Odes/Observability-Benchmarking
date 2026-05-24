package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.application.job.CommandRunner;
import io.github.georgecodes.benchmarking.orchestrator.application.job.HeartbeatScheduler;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobAdmissionPolicy;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobEvent;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobEventPublisher;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobStatusSnapshot;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobStore;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobTerminalStatus;
import io.github.georgecodes.benchmarking.orchestrator.domain.JobStatus;
import io.smallrye.mutiny.Multi;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import lombok.extern.jbosslog.JBossLog;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.MDC;

/** Manages asynchronous job execution, heartbeat scheduling, and event publishing. */
@JBossLog
@ApplicationScoped
public class JobManager {

  /** Compose CLI environment variable that enables Docker-based builds. */
  static final String COMPOSE_DOCKER_CLI_BUILD_ENV = "COMPOSE_DOCKER_CLI_BUILD";

  /** Environment defaults that enable Docker BuildKit for build jobs. */
  private static final Map<String, String> DOCKER_ENV_OVERRIDES =
      Map.of("DOCKER_BUILDKIT", "1", COMPOSE_DOCKER_CLI_BUILD_ENV, "1");

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

  /**
   * Creates a job manager with the collaborators needed to validate, execute, and publish jobs.
   *
   * @param maxBufferLines maximum number of buffered events per job
   * @param heartbeatIntervalMs heartbeat interval in milliseconds
   * @param heartbeatScheduler scheduler used to publish heartbeat events
   * @param admissionPolicy policy controlling concurrent submissions
   * @param commandRunner runner used to execute validated commands
   * @param jobStore store used to persist job state and event streams
   * @param eventPublisher publisher used to fan out job events
   */
  @Inject
  public JobManager(
      @ConfigProperty(name = "orchestrator.max-buffer-lines") int maxBufferLines,
      @ConfigProperty(name = "orchestrator.heartbeat.interval-ms") long heartbeatIntervalMs,
      HeartbeatScheduler heartbeatScheduler,
      JobAdmissionPolicy admissionPolicy,
      CommandRunner commandRunner,
      JobStore jobStore,
      JobEventPublisher eventPublisher) {
    this.maxBufferLines = maxBufferLines;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.heartbeatScheduler = heartbeatScheduler;
    this.admissionPolicy = admissionPolicy;
    this.commandRunner = commandRunner;
    this.jobStore = jobStore;
    this.eventPublisher = eventPublisher;
    this.executor =
        Executors.newSingleThreadExecutor(
            r -> {
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
    String requestId = currentRequestId();
    try {
      executor.submit(() -> runJob(id, cmd, admission, requestId));
      return id;
    } catch (RejectedExecutionException ex) {
      admission.close();
      throw ex;
    }
  }

  /**
   * Validates that the provided run id is authorized to access the given job.
   *
   * @param jobId the job identifier to check
   * @param runId the dashboard run identifier supplied by the caller
   */
  public void validateRunId(UUID jobId, String runId) {
    jobStore.validateRunId(jobId, runId);
  }

  /**
   * Returns the current status snapshot for a job.
   *
   * @param id the job identifier
   * @return the latest job status snapshot
   */
  public JobStatusSnapshot status(UUID id) {
    return jobStore.status(id);
  }

  /**
   * Returns a replayable event stream for a job.
   *
   * @param id the job identifier
   * @return the event stream for the job
   */
  public Multi<JobEvent> events(UUID id) {
    return jobStore.events(id);
  }

  /**
   * Runs a submitted job, publishing lifecycle and heartbeat events until completion.
   *
   * @param jobId the job identifier
   * @param cmd the validated command to execute
   * @param admission the admission handle that reserves the execution slot
   * @param requestId the request id captured from the submission request
   */
  private void runJob(
      UUID jobId,
      CommandPolicy.ValidatedCommand cmd,
      JobAdmissionPolicy.Admission admission,
      String requestId) {
    try (admission) {
      MDC.put("jobId", jobId.toString());
      if (requestId != null) {
        MDC.put("requestId", requestId);
      }

      HeartbeatScheduler.Cancellable heartbeat = null;
      try {
        jobStore.markStarted(jobId, Instant.now());

        heartbeat = scheduleHeartbeat(jobId);

        var result =
            commandRunner.run(
                cmd.argv(),
                cmd.workspace(),
                DOCKER_ENV_OVERRIDES,
                event -> eventPublisher.publish(jobId, event));

        JobStatus terminal = JobTerminalStatus.from(false, result.exitCode());
        jobStore.markFinished(jobId, terminal.name(), result.finishedAt(), result.exitCode());
      } catch (IOException
          | ExecutionException
          | TimeoutException
          | SecurityException
          | IllegalStateException e) {
        eventPublisher.publish(
            jobId,
            JobEvent.status(
                "FAILED exception=" + e.getClass().getSimpleName() + " " + e.getMessage()));
        jobStore.markFinished(jobId, JobStatus.FAILED.name(), Instant.now(), null);
        log.errorf(e, "Job failed jobId=%s", jobId);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        eventPublisher.publish(
            jobId,
            JobEvent.status(
                "FAILED exception=" + e.getClass().getSimpleName() + " " + e.getMessage()));
        jobStore.markFinished(jobId, JobStatus.FAILED.name(), Instant.now(), null);
        log.errorf(e, "Job failed jobId=%s", jobId);
      } finally {
        if (heartbeat != null) {
          heartbeat.cancel();
        }
        MDC.remove("jobId");
        MDC.remove("requestId");
      }
    }
  }

  /**
   * Reads the current request id from MDC for propagation to asynchronous job execution.
   *
   * @return the request id, or {@code null} when the submission did not originate from HTTP
   */
  private static String currentRequestId() {
    Object requestId = MDC.get("requestId");
    return requestId == null ? null : String.valueOf(requestId);
  }

  /**
   * Schedules periodic heartbeat events for a running job.
   *
   * @param jobId the job identifier
   * @return the cancellable heartbeat handle
   */
  private HeartbeatScheduler.Cancellable scheduleHeartbeat(UUID jobId) {
    final long jobStartNanos = System.nanoTime();
    final AtomicLong heartbeatCounter = new AtomicLong();

    return heartbeatScheduler.scheduleFixedRate(
        heartbeatIntervalMs,
        () -> {
          try {
            long count = heartbeatCounter.incrementAndGet();
            long uptimeMs = (System.nanoTime() - jobStartNanos) / 1_000_000L;

            eventPublisher.publish(
                jobId, JobEvent.status(": heartbeat #" + count + " uptimeMs=" + uptimeMs));
          } catch (IllegalStateException ex) {
            log.tracef("Heartbeat publish failed for jobId=%s: %s", jobId, ex.getMessage());
          }
        });
  }

  /** Stops the background executor during bean shutdown. */
  @PreDestroy
  void shutdown() {
    executor.shutdownNow();
  }
}
