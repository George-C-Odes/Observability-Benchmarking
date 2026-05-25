package io.github.georgecodes.benchmarking.orchestrator.application;

import java.io.Serial;
import lombok.Getter;

/**
 * Base exception for typed service errors.
 *
 * <p>Provides a shared {@link Type} enum so all domain services use the same error categories and a
 * single JAX-RS {@code ExceptionMapper} can translate every subclass to the correct HTTP status.
 */
public abstract class ServiceException extends RuntimeException {

  @Serial private static final long serialVersionUID = 1L;

  /** Coarse error category that maps 1-to-1 to an HTTP status code. */
  public enum Type {
    /** Resource is not found (→ 404). */
    NOT_FOUND,
    /** I/O error during file or network operations (→ 500). */
    IO_ERROR,
    /** Client-side validation error (→ 400). */
    VALIDATION_ERROR
  }

  /** Coarse error category for this exception. */
  @Getter private final Type type;

  /**
   * Creates a typed service exception without an underlying cause.
   *
   * @param message the error message
   * @param type the coarse error category
   */
  protected ServiceException(String message, Type type) {
    super(message);
    this.type = type;
  }

  /**
   * Creates a typed service exception with an underlying cause.
   *
   * @param message the error message
   * @param type the coarse error category
   * @param cause the underlying cause
   */
  protected ServiceException(String message, Type type, Throwable cause) {
    super(message, cause);
    this.type = type;
  }
}
