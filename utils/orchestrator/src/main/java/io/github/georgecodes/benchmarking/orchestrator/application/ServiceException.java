package io.github.georgecodes.benchmarking.orchestrator.application;

/**
 * Base exception for typed service errors.
 *
 * <p>Provides a shared {@link Type} enum so all domain services use the same
 * error categories and a single JAX-RS {@code ExceptionMapper} can translate
 * every subclass to the correct HTTP status.</p>
 */
@SuppressWarnings("LombokGetterMayBeUsed")
public abstract class ServiceException extends RuntimeException {

    /**
     * Coarse error category that maps 1-to-1 to an HTTP status code.
     */
    public enum Type {
        /** Resource not found (→ 404). */
        NOT_FOUND,
        /** I/O error during file or network operations (→ 500). */
        IO_ERROR,
        /** Client-side validation error (→ 400). */
        VALIDATION_ERROR
    }

    private final Type type;

    protected ServiceException(String message, Type type) {
        super(message);
        this.type = type;
    }

    protected ServiceException(String message, Type type, Throwable cause) {
        super(message, cause);
        this.type = type;
    }

    /** Returns the coarse error category. */
    public Type getType() {
        return type;
    }
}
