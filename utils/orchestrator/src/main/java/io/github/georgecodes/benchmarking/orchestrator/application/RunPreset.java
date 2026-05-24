package io.github.georgecodes.benchmarking.orchestrator.application;

/**
 * A preconfigured Docker command discovered from an IDE run configuration.
 *
 * @param category preset category
 * @param title human-friendly preset title
 * @param command Docker command to execute
 * @param sourceFile source run-configuration file
 */
public record RunPreset(String category, String title, String command, String sourceFile) {}
