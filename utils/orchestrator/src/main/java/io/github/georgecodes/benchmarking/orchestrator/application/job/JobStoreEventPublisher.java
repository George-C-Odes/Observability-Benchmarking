package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import jakarta.enterprise.context.ApplicationScoped;
import lombok.RequiredArgsConstructor;

import java.util.UUID;

/**
 * Default event publisher that persists/buffers events through the configured {@link JobStore}.
 */
@ApplicationScoped
@RequiredArgsConstructor
public class JobStoreEventPublisher implements JobEventPublisher {

  /** Target job store used to buffer/persist published events. */
  private final JobStore jobStore;

  @Override
  public void publish(UUID jobId, JobEvent event) {
    jobStore.emit(jobId, event);
  }
}