package com.benchmarking.application.job;

import com.benchmarking.api.JobEvent;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Port for executing a command and streaming events.
 *
 * <p>This abstraction allows {@link com.benchmarking.application.JobManager} to be tested
 * without running external processes.
 */
public interface CommandRunner {

  record ExecutionResult(int exitCode, Instant finishedAt) {
  }

  @FunctionalInterface
  interface EventSink {
    void emit(JobEvent event);
  }

  ExecutionResult run(
    List<String> argv,
    String workspace,
    Map<String, String> envOverrides,
    EventSink sink
  ) throws Exception;
}
