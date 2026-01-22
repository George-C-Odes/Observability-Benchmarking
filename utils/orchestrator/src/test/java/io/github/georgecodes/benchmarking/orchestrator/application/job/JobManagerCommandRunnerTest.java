package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.application.CommandPolicy;
import io.github.georgecodes.benchmarking.orchestrator.application.JobManager;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class JobManagerCommandRunnerTest {

  @Inject
  JobManager jobManager;

  @Inject
  CommandPolicy policy;

  @Test
  void submit_usesCommandRunner_andJobReachesTerminalState() throws Exception {
    var validated = policy.validate("docker compose version");
    var jobId = jobManager.submit(validated, "run-1");

    CountDownLatch terminal = new CountDownLatch(1);
    AtomicReference<String> terminalStatus = new AtomicReference<>();
    AtomicReference<Integer> terminalExitCode = new AtomicReference<>();

    var subscription = jobManager.events(jobId)
      .subscribe().with(e -> {
        if ("terminalSummary".equals(e.getType())) {
          terminalStatus.set(e.getJobStatus());
          terminalExitCode.set(e.getExitCode());
          terminal.countDown();
        }
      });

    try {
      assertTrue(terminal.await(2, TimeUnit.SECONDS), "Job did not finish in time");
      assertEquals("SUCCEEDED", terminalStatus.get());
      assertEquals(0, terminalExitCode.get());
    } finally {
      subscription.cancel();
    }
  }
}
