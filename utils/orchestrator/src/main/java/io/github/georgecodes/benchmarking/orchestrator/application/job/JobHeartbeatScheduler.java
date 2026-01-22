package io.github.georgecodes.benchmarking.orchestrator.application.job;

import java.util.Objects;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Schedules periodic heartbeat events to keep SSE connections alive.
 */
public class JobHeartbeatScheduler {

  /**
   * Underlying scheduler used to execute periodic tasks.
   */
  private final ScheduledExecutorService scheduler;

  public JobHeartbeatScheduler(ScheduledExecutorService scheduler) {
    this.scheduler = Objects.requireNonNull(scheduler, "scheduler");
  }

  public ScheduledFuture<?> schedule(long intervalMs, Runnable task) {
    long heartbeatMs = Math.max(1000L, intervalMs);
    return scheduler.scheduleAtFixedRate(task, heartbeatMs, heartbeatMs, TimeUnit.MILLISECONDS);
  }
}
