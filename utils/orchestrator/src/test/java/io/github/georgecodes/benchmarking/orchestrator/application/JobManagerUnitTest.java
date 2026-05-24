package io.github.georgecodes.benchmarking.orchestrator.application;

import static org.junit.jupiter.api.Assertions.*;

import io.github.georgecodes.benchmarking.orchestrator.application.job.CommandRunner;
import io.github.georgecodes.benchmarking.orchestrator.application.job.HeartbeatScheduler;
import io.github.georgecodes.benchmarking.orchestrator.application.job.InMemoryJobStore;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobAdmissionPolicy;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobEvent;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobStoreEventPublisher;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.jboss.logging.MDC;
import org.junit.jupiter.api.Test;

class JobManagerUnitTest {

  @Test
  void submitRunsCommandPublishesHeartbeatAndFinishesSuccessfully() throws Exception {
    InMemoryJobStore store = new InMemoryJobStore();
    AtomicBoolean admissionClosed = new AtomicBoolean(false);
    AtomicBoolean heartbeatCanceled = new AtomicBoolean(false);
    CountDownLatch admissionClosedSignal = new CountDownLatch(1);
    CountDownLatch heartbeatCanceledSignal = new CountDownLatch(1);
    AtomicReference<List<String>> seenArgv = new AtomicReference<>();
    AtomicReference<String> seenWorkspace = new AtomicReference<>();
    AtomicReference<Map<String, String>> seenEnv = new AtomicReference<>();

    HeartbeatScheduler scheduler =
        (intervalMs, task) -> {
          assertEquals(1L, intervalMs);
          task.run();
          return () -> {
            heartbeatCanceled.set(true);
            heartbeatCanceledSignal.countDown();
          };
        };
    JobAdmissionPolicy admissionPolicy =
        () ->
            () -> {
              admissionClosed.set(true);
              admissionClosedSignal.countDown();
            };
    CommandRunner runner =
        (argv, workspace, envOverrides, sink) -> {
          seenArgv.set(argv);
          seenWorkspace.set(workspace);
          seenEnv.set(envOverrides);
          sink.emit(JobEvent.log("stdout", "hello"));
          return new CommandRunner.ExecutionResult(0, Instant.parse("2026-01-01T00:00:02Z"));
        };

    JobManager manager =
        new JobManager(
            10, 1, scheduler, admissionPolicy, runner, store, new JobStoreEventPublisher(store));

    CommandPolicy.ValidatedCommand validated =
        new CommandPolicy.ValidatedCommand(
            List.of("docker", "ps"), "C:/workspace", "C:/workspace/compose");
    MDC.put("requestId", "req-42");
    UUID jobId = manager.submit(validated, "run-42");
    MDC.remove("requestId");

    CountDownLatch terminal = new CountDownLatch(1);
    List<JobEvent> events = new ArrayList<>();
    var subscription =
        manager
            .events(jobId)
            .subscribe()
            .with(
                event -> {
                  events.add(event);
                  if ("terminalSummary".equals(event.type())) {
                    terminal.countDown();
                  }
                });

    try {
      assertTrue(terminal.await(2, TimeUnit.SECONDS), "job should reach terminal state");
    } finally {
      subscription.cancel();
      manager.shutdown();
    }

    assertEquals(List.of("docker", "ps"), seenArgv.get());
    assertEquals("C:/workspace", seenWorkspace.get());
    assertEquals(
        Map.of("DOCKER_BUILDKIT", "1", JobManager.COMPOSE_DOCKER_CLI_BUILD_ENV, "1"),
        seenEnv.get());
    assertTrue(
        events.stream()
            .anyMatch(
                e ->
                    "status".equals(e.type())
                        && e.message().startsWith(": heartbeat #1 uptimeMs=")));
    assertTrue(
        events.stream().anyMatch(e -> "log".equals(e.type()) && "hello".equals(e.message())));
    assertTrue(events.stream().anyMatch(e -> "req-42".equals(e.requestId())));
    assertEquals("SUCCEEDED", manager.status(jobId).status());
    manager.validateRunId(jobId, "run-42");
    assertTrue(admissionClosed.get());
    assertTrue(heartbeatCanceled.get());
    assertTrue(admissionClosedSignal.await(1, TimeUnit.SECONDS));
    assertTrue(heartbeatCanceledSignal.await(1, TimeUnit.SECONDS));
  }

  @Test
  void submitMarksJobFailedWhenCommandRunnerThrows() throws Exception {
    InMemoryJobStore store = new InMemoryJobStore();
    CountDownLatch admissionClosedSignal = new CountDownLatch(1);
    CountDownLatch heartbeatCanceledSignal = new CountDownLatch(1);

    JobManager manager =
        new JobManager(
            10,
            1,
            (intervalMs, task) -> {
              assertEquals(1L, intervalMs);
              assertNotNull(task);
              return heartbeatCanceledSignal::countDown;
            },
            () -> admissionClosedSignal::countDown,
            (argv, workspace, envOverrides, sink) -> {
              assertEquals(List.of("docker", "ps"), argv);
              assertEquals("C:/workspace", workspace);
              assertEquals(
                  Map.of("DOCKER_BUILDKIT", "1", JobManager.COMPOSE_DOCKER_CLI_BUILD_ENV, "1"),
                  envOverrides);
              assertNotNull(sink);
              throw new IllegalStateException("boom");
            },
            store,
            new JobStoreEventPublisher(store));

    UUID jobId =
        manager.submit(
            new CommandPolicy.ValidatedCommand(
                List.of("docker", "ps"), "C:/workspace", "C:/workspace/compose"),
            null);

    CountDownLatch terminal = new CountDownLatch(1);
    List<JobEvent> events = new ArrayList<>();
    var subscription =
        manager
            .events(jobId)
            .subscribe()
            .with(
                event -> {
                  events.add(event);
                  if ("terminalSummary".equals(event.type())) {
                    terminal.countDown();
                  }
                });

    try {
      assertTrue(terminal.await(2, TimeUnit.SECONDS), "failed job should reach terminal state");
    } finally {
      subscription.cancel();
      manager.shutdown();
    }

    assertEquals("FAILED", manager.status(jobId).status());
    assertNull(manager.status(jobId).exitCode());
    assertTrue(
        events.stream()
            .anyMatch(
                e ->
                    "status".equals(e.type())
                        && e.message().startsWith("FAILED exception=IllegalStateException boom")));
    assertTrue(
        admissionClosedSignal.await(1, TimeUnit.SECONDS),
        "admission should be released during failure cleanup");
    assertTrue(
        heartbeatCanceledSignal.await(1, TimeUnit.SECONDS),
        "heartbeat should be canceled during failure cleanup");
  }
}
