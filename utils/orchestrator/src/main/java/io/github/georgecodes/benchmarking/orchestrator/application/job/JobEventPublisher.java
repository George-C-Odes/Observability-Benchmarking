package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;

import java.util.UUID;

/**
 * Port for publishing job events.
 *
 * <p>Default implementations can fan-out to {@link JobStore} and/or external sinks.
 */
public interface JobEventPublisher {
  void publish(UUID jobId, JobEvent event);
}
