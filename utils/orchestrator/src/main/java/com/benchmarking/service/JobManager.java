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
import java.util.concurrent.*;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.MultiEmitter;

@ApplicationScoped
public class JobManager {
  private static final Logger LOG = Logger.getLogger(JobManager.class);

  public enum Status { QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELED }

  @ConfigProperty(name = "orchestrator.max-buffer-lines", defaultValue = "2000")
  int maxBufferLines;

  @ConfigProperty(name = "orchestrator.serial-execution", defaultValue = "true")
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

  static final class Job {
    final UUID id;
    volatile Status status = Status.QUEUED;
    volatile Instant createdAt = Instant.now();
    volatile Instant startedAt;
    volatile Instant finishedAt;
    volatile Integer exitCode;
    volatile boolean canceled = false;

    final Deque<JobEvent> buffer;
    final int maxLines;

    final CopyOnWriteArrayList<MultiEmitter<? super JobEvent>> emitters = new CopyOnWriteArrayList<>();
    volatile boolean completed = false;
    volatile String lastLine = null;

    Job(UUID id, int maxLines) {
      this.id = id;
      this.maxLines = Math.max(100, maxLines);
      this.buffer = new ArrayDeque<>(this.maxLines);
    }

    synchronized void addToBuffer(JobEvent e) {
      if ("log".equals(e.type) && e.message != null) lastLine = e.message;
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
      r.jobId = id;
      r.status = status.name();
      r.createdAt = createdAt;
      r.startedAt = startedAt;
      r.finishedAt = finishedAt;
      r.exitCode = exitCode;
      r.lastLine = lastLine;
      return r;
    }
  }
}
