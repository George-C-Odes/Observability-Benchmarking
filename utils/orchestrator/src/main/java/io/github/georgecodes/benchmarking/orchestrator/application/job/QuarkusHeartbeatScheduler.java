package io.github.georgecodes.benchmarking.orchestrator.application.job;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Default {@link HeartbeatScheduler} implementation using a single-threaded scheduled executor.
 */
@ApplicationScoped
public class QuarkusHeartbeatScheduler implements HeartbeatScheduler {

  /**
   * Single-threaded scheduler used to execute heartbeat tasks.
   */
  private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
    Thread t = new Thread(r, "orchestrator-heartbeats");
    t.setDaemon(true);
    return t;
  });

  /**
   * Schedules the provided heartbeat task at a fixed interval.
   *
   * @param intervalMs the requested interval in milliseconds
   * @param task the task to execute repeatedly
   * @return a cancellable handle for the scheduled task
   */
  @Override
  public Cancellable scheduleFixedRate(long intervalMs, Runnable task) {
    long heartbeatMs = Math.max(1000L, intervalMs);
    ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(task, heartbeatMs, heartbeatMs, TimeUnit.MILLISECONDS);
    return () -> future.cancel(true);
  }

  /**
   * Stops the scheduler during bean shutdown.
   */
  @PreDestroy
  void shutdown() {
    scheduler.shutdownNow();
  }
}
