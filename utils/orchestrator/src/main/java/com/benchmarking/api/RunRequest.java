package com.benchmarking.api;

import jakarta.validation.constraints.NotBlank;

/**
 * Request to run a command via the orchestrator.
 */
public class RunRequest {
  /**
   * The command to execute.
   */
  @NotBlank
  private String command;

  /**
   * Optional client-provided run identifier used to correlate dashboard sessions.
   * When provided, it is bound to the created job and must be supplied on subsequent
   * status/event requests to prevent cross-run mixing.
   */
  private String runId;

  /**
   * Gets the command.
   *
   * @return the command
   */
  public String getCommand() {
    return command;
  }

  /**
   * Sets the command.
   *
   * @param command the command
   */
  public void setCommand(String command) {
    this.command = command;
  }

  /**
   * Gets the run identifier.
   *
   * @return the run identifier
   */
  public String getRunId() {
    return runId;
  }

  /**
   * Sets the run identifier.
   *
   * @param runId the run identifier
   */
  public void setRunId(String runId) {
    this.runId = runId;
  }
}
