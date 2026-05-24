package io.github.georgecodes.benchmarking.orchestrator.application.job;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.UUID;
import lombok.RequiredArgsConstructor;

/** Default event publisher that persists/buffers events through the configured {@link JobStore}. */
@ApplicationScoped
@RequiredArgsConstructor
public class JobStoreEventPublisher implements JobEventPublisher {

  /** Target job store used to buffer/persist published events. */
  private final JobStore jobStore;

  /**
   * Publishes a job event by forwarding it to the underlying job store.
   *
   * @param jobId the job identifier
   * @param event the event to publish
   */
  @Override
  public void publish(UUID jobId, JobEvent event) {
    jobStore.emit(jobId, event);
  }
}
