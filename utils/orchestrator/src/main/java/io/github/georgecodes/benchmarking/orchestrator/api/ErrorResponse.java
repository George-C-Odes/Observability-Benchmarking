package io.github.georgecodes.benchmarking.orchestrator.api;

/**
 * Shared error response structure for consistent API error payloads.
 *
 * @param error   error type identifier
 * @param message detailed error message
 */
public record ErrorResponse(String error, String message) { }