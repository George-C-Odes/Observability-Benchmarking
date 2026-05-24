package io.github.georgecodes.benchmarking.orchestrator.application;

import java.util.List;

/** Port for validating one supported Docker command group. */
public interface CommandGroupValidator {

  /**
   * Returns the Docker command-group token this validator supports.
   *
   * @return command group, such as {@code compose} or {@code buildx}
   */
  String commandGroup();

  /**
   * Validates tokenized command arguments for this command group.
   *
   * @param tokens tokenized Docker command
   * @return validated command metadata
   */
  CommandPolicy.ValidatedCommand validate(List<String> tokens);
}
