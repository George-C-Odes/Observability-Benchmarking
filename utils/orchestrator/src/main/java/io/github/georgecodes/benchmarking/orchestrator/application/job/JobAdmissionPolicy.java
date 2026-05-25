package io.github.georgecodes.benchmarking.orchestrator.application.job;

/** Port for deciding whether a job submission is admitted. */
@FunctionalInterface
public interface JobAdmissionPolicy {

  /** Admission handle that must be closed to release the slot. */
  @FunctionalInterface
  interface Admission extends AutoCloseable {
    /** Releases the acquired admission slot. */
    @Override
    void close();
  }

  /**
   * Attempts to acquire an admission slot.
   *
   * @return admission handle
   * @throws JobAdmissionRejectedException when no slot is available
   */
  Admission acquire();
}
