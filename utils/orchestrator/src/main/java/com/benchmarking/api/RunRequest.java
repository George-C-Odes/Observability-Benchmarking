package com.benchmarking.api;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

/**
 * Request to run a command via the orchestrator.
 */
@Getter
@Setter
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
}
