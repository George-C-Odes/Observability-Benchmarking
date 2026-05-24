package io.github.georgecodes.benchmarking.orchestrator.application.job;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

/**
 * Port for executing a command and streaming events.
 *
 * <p>This abstraction allows testing {@link
 * io.github.georgecodes.benchmarking.orchestrator.application.JobManager} without running external
 * processes.
 */
@FunctionalInterface
public interface CommandRunner {

  /**
   * Result metadata captured after a command finishes.
   *
   * @param exitCode the process exit code
   * @param finishedAt the timestamp when execution completed
   */
  record ExecutionResult(int exitCode, Instant finishedAt) {}

  /** Sink for job events emitted while a command is executing. */
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
   * @throws IOException if the command process cannot be started
   * @throws InterruptedException if the waiting thread is interrupted
   * @throws ExecutionException if a stream reader fails while processing process output
   * @throws TimeoutException if process stream readers do not finish promptly
   */
  ExecutionResult run(
      List<String> argv, String workspace, Map<String, String> envOverrides, EventSink sink)
      throws IOException, InterruptedException, ExecutionException, TimeoutException;
}
