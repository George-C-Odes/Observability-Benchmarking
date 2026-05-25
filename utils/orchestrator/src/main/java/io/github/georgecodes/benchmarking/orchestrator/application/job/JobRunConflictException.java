package io.github.georgecodes.benchmarking.orchestrator.application.job;

import java.io.Serial;

/** Application-layer exception raised when a caller references a job from the wrong run. */
public class JobRunConflictException extends RuntimeException {

  @Serial private static final long serialVersionUID = 1L;

  /** Stable machine-readable error code returned by the API adapter. */
  private final String code;

  /**
   * Creates a run-conflict exception.
   *
   * @param errorCode stable machine-readable error code
   * @param message human-readable error detail
   */
  public JobRunConflictException(String errorCode, String message) {
    super(message);
    this.code = errorCode;
  }

  /**
   * Returns the stable machine-readable error code.
   *
   * @return the API error code
   */
  public String errorCode() {
    return code;
  }
}
