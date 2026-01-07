package com.benchmarking.service;

import com.benchmarking.api.JobEvent;
import com.benchmarking.api.JobStatusResponse;
import org.jboss.logging.Logger;
import org.jboss.logging.MDC;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.enterprise.context.ApplicationScoped;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.MultiEmitter;

@ApplicationScoped
public class JobManager {
  /**
   * Logger instance for this class.
   */
  private static final Logger LOG = Logger.getLogger(JobManager.class);

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

  @ConfigProperty(name = "orchestrator.max-buffer-lines")
  int maxBufferLines;

  @ConfigProperty(name = "orchestrator.serial-execution")
  boolean serialExecution;

  private final ExecutorService executor;
  private final ConcurrentMap<UUID, Job> jobs = new ConcurrentHashMap<>();

  public JobManager() {
    this.executor = Executors.newSingleThreadExecutor(r -> {
      Thread t = new Thread(r, "orchestrator-job-runner");
      t.setDaemon(true);
      return t;
    });
  }

  public UUID submit(CommandPolicy.ValidatedCommand cmd) {
    UUID id = UUID.randomUUID();
    Job job = new Job(id, maxBufferLines);
    jobs.put(id, job);
    job.emit(JobEvent.status("QUEUED"));
    executor.submit(() -> runJob(job, cmd));
    return id;
  }

  public JobStatusResponse status(UUID id) {
    return get(id).toStatus();
  }

  public Multi<JobEvent> events(UUID id) {
    return get(id).multi();
  }

  private Job get(UUID id) {
    Job j = jobs.get(id);
    if (j == null) throw new IllegalArgumentException("Unknown jobId: " + id);
    return j;
  }

  private void runJob(Job job, CommandPolicy.ValidatedCommand cmd) {
    MDC.put("jobId", job.id.toString());
    try {
      job.status = Status.RUNNING;
      job.startedAt = Instant.now();
      job.emit(JobEvent.status("RUNNING"));

      ProcessBuilder pb = new ProcessBuilder(cmd.argv());
      pb.directory(new java.io.File(cmd.workspace()));
      pb.redirectErrorStream(false);

      Map<String, String> env = pb.environment();
      env.putIfAbsent("DOCKER_BUILDKIT", "1");
      env.putIfAbsent("COMPOSE_DOCKER_CLI_BUILD", "1");

      LOG.infof("Executing: %s", String.join(" ", cmd.argv()));
      job.emit(JobEvent.status("EXEC " + String.join(" ", cmd.argv())));

      Process p = pb.start();

      // Stream stdout/stderr
      ExecutorService streams = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "orchestrator-stream-" + job.id);
        t.setDaemon(true);
        return t;
      });

      Future<?> outF = streams.submit(() -> streamLines(job, p.getInputStream(), "stdout"));
      Future<?> errF = streams.submit(() -> streamLines(job, p.getErrorStream(), "stderr"));

      int exit = p.waitFor();
      outF.get(10, TimeUnit.SECONDS);
      errF.get(10, TimeUnit.SECONDS);
      streams.shutdownNow();

      job.exitCode = exit;
      job.finishedAt = Instant.now();

      if (job.canceled) {
        job.status = Status.CANCELED;
        job.emit(JobEvent.status("CANCELED"));
      } else if (exit == 0) {
        job.status = Status.SUCCEEDED;
        job.emit(JobEvent.status("SUCCEEDED"));
      } else {
        job.status = Status.FAILED;
        job.emit(JobEvent.status("FAILED exitCode=" + exit));
      }

      LOG.infof("Finished status=%s exitCode=%s", job.status, exit);
      job.complete();
    } catch (Exception e) {
      job.finishedAt = Instant.now();
      job.status = Status.FAILED;
      String msg = "FAILED exception=" + e.getClass().getSimpleName() + " " + e.getMessage();
      job.emit(JobEvent.status(msg));
      LOG.error(msg, e);
      job.complete();
    } finally {
      MDC.remove("jobId");
    }
  }

  private void streamLines(Job job, java.io.InputStream in, String stream) {
    try (BufferedReader br = new BufferedReader(new InputStreamReader(in))) {
      String line;
      while ((line = br.readLine()) != null) {
        job.emit(JobEvent.log(stream, line));
        // Log to orchestrator stdout so Alloy can scrape
        LOG.infof("[%s] %s", stream, line);
      }
    } catch (Exception ignored) {}
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
      if ("log".equals(e.getType()) && e.getMessage() != null) lastLine = e.getMessage();
      if (buffer.size() >= maxLines) buffer.removeFirst();
      buffer.addLast(e);
    }

    void emit(JobEvent e) {
      addToBuffer(e);
      for (var em : emitters) {
        try { em.emit(e); } catch (Exception ignored) {}
      }
    }

    void complete() {
      completed = true;
      for (var em : emitters) {
        try { em.complete(); } catch (Exception ignored) {}
      }
    }

    Multi<JobEvent> multi() {
      return Multi.createFrom().emitter(em -> {
        synchronized (this) {
          for (JobEvent e : buffer) em.emit(e);
        }
        emitters.add(em);
        em.onTermination(() -> emitters.remove(em));
        if (completed) em.complete();
      });
    }

    JobStatusResponse toStatus() {
      JobStatusResponse r = new JobStatusResponse();
      r.setJobId(id);
      r.setStatus(status.name());
      r.setCreatedAt(createdAt);
      r.setStartedAt(startedAt);
      r.setFinishedAt(finishedAt);
      r.setExitCode(exitCode);
      r.setLastLine(lastLine);
      return r;
    }
  }
}
