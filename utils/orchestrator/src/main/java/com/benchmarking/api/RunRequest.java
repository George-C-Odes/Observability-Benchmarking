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
}
