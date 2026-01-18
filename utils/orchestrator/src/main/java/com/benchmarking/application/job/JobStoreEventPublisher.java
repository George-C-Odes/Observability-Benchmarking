package com.benchmarking.application.job;

import com.benchmarking.api.JobEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

/**
 * Default event publisher that persists/buffers events through the configured {@link JobStore}.
 */
@ApplicationScoped
public class JobStoreEventPublisher implements JobEventPublisher {

  @Inject
  JobStore jobStore;

  @Override
  public void publish(UUID jobId, JobEvent event) {
    jobStore.emit(jobId, event);
  }
}
