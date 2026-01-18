package com.benchmarking.application.job;

/**
 * Port for scheduling periodic heartbeats.
 */
public interface HeartbeatScheduler {

  /**
   * Handle for cancelling a scheduled task.
   */
  interface Cancellable {
    void cancel();
  }

  /**
   * Schedules {@code task} at a fixed rate.
   *
   * @param intervalMs requested interval in milliseconds
   * @param task task to run
   * @return cancellable handle
   */
  Cancellable scheduleFixedRate(long intervalMs, Runnable task);
}
