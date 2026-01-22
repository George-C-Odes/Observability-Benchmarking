package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

/**
 * Default event publisher that persists/buffers events through the configured {@link JobStore}.
 */
@ApplicationScoped
public class JobStoreEventPublisher implements JobEventPublisher {

  /**
   * Target job store used to buffer/persist published events.
   */
  @Inject
  JobStore jobStore;

  @Override
  public void publish(UUID jobId, JobEvent event) {
    jobStore.emit(jobId, event);
  }
}
