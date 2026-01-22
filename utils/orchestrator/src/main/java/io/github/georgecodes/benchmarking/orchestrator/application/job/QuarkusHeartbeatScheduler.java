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

  @Override
  public Cancellable scheduleFixedRate(long intervalMs, Runnable task) {
    long heartbeatMs = Math.max(1000L, intervalMs);
    ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(task, heartbeatMs, heartbeatMs, TimeUnit.MILLISECONDS);
    return () -> future.cancel(true);
  }

  @PreDestroy
  void shutdown() {
    scheduler.shutdownNow();
  }
}
