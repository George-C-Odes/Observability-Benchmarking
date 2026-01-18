package com.benchmarking.application.job;

import com.benchmarking.api.JobEvent;

import java.util.UUID;

/**
 * Port for publishing job events.
 *
 * <p>Default implementations can fan-out to {@link JobStore} and/or external sinks.
 */
public interface JobEventPublisher {
  void publish(UUID jobId, JobEvent event);
}
