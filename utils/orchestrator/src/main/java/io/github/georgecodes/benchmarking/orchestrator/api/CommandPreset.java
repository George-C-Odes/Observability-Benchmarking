package io.github.georgecodes.benchmarking.orchestrator.api;

import io.github.georgecodes.benchmarking.orchestrator.application.RunPreset;

/**
 * A preconfigured Docker command discovered from IntelliJ's .run XML files.
 *
 * @param category one of build-img | single-cont | multi-cont
 * @param title human-friendly name
 * @param command plain docker command to send to /v1/run
 * @param sourceFile the originating .run XML file (relative path)
 */
public record CommandPreset(String category, String title, String command, String sourceFile) {

  /**
   * Maps an application-layer run preset to the API representation.
   *
   * @param preset application-layer run preset
   * @return API command preset
   */
  public static CommandPreset from(RunPreset preset) {
    return new CommandPreset(
        preset.category(), preset.title(), preset.command(), preset.sourceFile());
  }
}
