package io.github.georgecodes.benchmarking.orchestrator.application.health;

/**
 * Application-layer health status for one configured service.
 *
 * @param name service name
 * @param status service status
 * @param statusCode HTTP status code when available
 * @param responseTime response time in milliseconds
 * @param error error detail when available
 * @param baseUrl configured base URL
 * @param body response body when available
 */
public record ServiceHealth(
    String name,
    String status,
    Integer statusCode,
    Long responseTime,
    String error,
    String baseUrl,
    String body) {}
