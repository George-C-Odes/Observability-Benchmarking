package io.github.georgecodes.benchmarking.orchestrator.application.health;

/**
 * Application-layer endpoint definition for one configured health probe.
 *
 * @param name service name
 * @param baseUrl configured base URL
 * @param healthPath relative health endpoint path
 */
public record HealthEndpoint(String name, String baseUrl, String healthPath) {}
