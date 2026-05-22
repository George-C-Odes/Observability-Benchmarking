package io.github.georgecodes.benchmarking.orchestrator.application.job;

/**
 * Port for deciding whether a job submission is admitted.
 */
public interface JobAdmissionPolicy {

  /**
   * Admission handle that must be closed to release the slot.
   */
  interface Admission extends AutoCloseable {
    /**
     * Releases the acquired admission slot.
     */
    @Override
    void close();
  }

  /**
   * Attempts to acquire an admission slot.
   *
   * @return admission handle
   * @throws jakarta.ws.rs.ServiceUnavailableException when no slot is available
   */
  Admission acquire();
}
