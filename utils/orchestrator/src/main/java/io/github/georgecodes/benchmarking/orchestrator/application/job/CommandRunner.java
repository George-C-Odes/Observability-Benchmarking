package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Port for executing a command and streaming events.
 *
 * <p>This abstraction allows testing {@link io.github.georgecodes.benchmarking.orchestrator.application.JobManager}
 * without running external processes.
 */
public interface CommandRunner {

  /**
   * Result metadata captured after a command finishes.
   *
   * @param exitCode the process exit code
   * @param finishedAt the timestamp when execution completed
   */
  record ExecutionResult(int exitCode, Instant finishedAt) {
  }

  /**
   * Sink for job events emitted while a command is executing.
   */
  @FunctionalInterface
  interface EventSink {
    /**
     * Emits a job event produced while the command is running.
     *
     * @param event the event to publish
     */
    void emit(JobEvent event);
  }

  /**
   * Executes a command and streams status/log events through the provided sink.
   *
   * @param argv the command arguments to execute
   * @param workspace the working directory for the process
   * @param envOverrides environment values to merge into the process environment
   * @param sink the sink that receives emitted job events
   * @return the process execution result
   * @throws Exception if the command cannot be executed successfully
   */
  ExecutionResult run(
    List<String> argv,
    String workspace,
    Map<String, String> envOverrides,
    EventSink sink
  ) throws Exception;
}
