package com.benchmarking.application.job;

import com.benchmarking.api.JobEvent;
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Alternative;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Test-only {@link CommandRunner} that does not spawn real processes.
 */
@Alternative
@Priority(1)
@ApplicationScoped
public class FakeCommandRunner implements CommandRunner {

  @Override
  public ExecutionResult run(
    List<String> argv,
    String workspace,
    Map<String, String> envOverrides,
    EventSink sink
  ) {
    // minimal simulation: emit a log line and succeed
    sink.emit(JobEvent.log("stdout", "fake-run"));
    return new ExecutionResult(0, Instant.now());
  }
}
