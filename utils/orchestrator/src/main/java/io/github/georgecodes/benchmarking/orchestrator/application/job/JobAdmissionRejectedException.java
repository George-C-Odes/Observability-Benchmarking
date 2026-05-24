package io.github.georgecodes.benchmarking.orchestrator.application.job;

import java.io.Serial;

/** Application-layer exception raised when a submitted job cannot be admitted for execution. */
public class JobAdmissionRejectedException extends RuntimeException {

  @Serial private static final long serialVersionUID = 1L;

  /**
   * Creates a job-admission rejection exception.
   *
   * @param message human-readable rejection reason
   */
  public JobAdmissionRejectedException(String message) {
    super(message);
  }
}
