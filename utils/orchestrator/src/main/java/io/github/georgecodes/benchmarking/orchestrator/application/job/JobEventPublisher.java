package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;

import java.util.UUID;

/**
 * Port for publishing job events.
 *
 * <p>Default implementations can fan-out to {@link JobStore} and/or external sinks.
 */
public interface JobEventPublisher {
  /**
   * Publishes an event for the specified job.
   *
   * @param jobId the job identifier
   * @param event the event to publish
   */
  void publish(UUID jobId, JobEvent event);
}
