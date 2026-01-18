package com.benchmarking.application.job;

import com.benchmarking.application.CommandPolicy;
import com.benchmarking.application.JobManager;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class JobManagerCommandRunnerTest {

  @Inject
  JobManager jobManager;

  @Inject
  CommandPolicy policy;

  @Test
  void submit_usesCommandRunner_andJobReachesTerminalState() {
    var validated = policy.validate("docker compose version");
    var jobId = jobManager.submit(validated, "run-1");

    // wait briefly for async job thread to finish
    long deadline = System.currentTimeMillis() + 2000;
    while (System.currentTimeMillis() < deadline) {
      var st = jobManager.status(jobId);
      if (List.of("SUCCEEDED", "FAILED", "CANCELED").contains(st.status())) {
        assertEquals("SUCCEEDED", st.status());
        assertEquals(0, st.exitCode());
        return;
      }
      try {
        Thread.sleep(25);
      } catch (InterruptedException ignored) {
        Thread.currentThread().interrupt();
        break;
      }
    }

    fail("Job did not finish in time");
  }
}
