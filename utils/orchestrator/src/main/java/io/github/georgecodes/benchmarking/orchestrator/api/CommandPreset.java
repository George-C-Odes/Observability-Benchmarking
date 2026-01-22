package io.github.georgecodes.benchmarking.orchestrator.api;

/**
 * A preconfigured Docker command discovered from IntelliJ's .run XML files.
 *
 * @param category one of build-img | single-cont | multi-cont
 * @param title human-friendly name
 * @param command plain docker command to send to /v1/run
 * @param sourceFile the originating .run XML file (relative path)
 */
public record CommandPreset(
    String category,
    String title,
    String command,
    String sourceFile
) {
}
