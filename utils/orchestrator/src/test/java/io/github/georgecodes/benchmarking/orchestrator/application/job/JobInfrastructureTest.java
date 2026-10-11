package io.github.georgecodes.benchmarking.orchestrator.application.job;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.github.georgecodes.benchmarking.orchestrator.domain.JobStatus;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.helpers.test.AssertSubscriber;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class JobInfrastructureTest {

  @TempDir Path tempDir;

  @Test
  void testSingleFlightAdmissionPolicyAllowsOneAtATimeAndReleasesOnClose() {
    SingleFlightJobAdmissionPolicy policy = new SingleFlightJobAdmissionPolicy();

    JobAdmissionPolicy.Admission admission = policy.acquire();
    assertThrows(
        JobAdmissionRejectedException.class,
        policy::acquire,
        "a second job should be rejected while the admission slot is held");

    admission.close();

    JobAdmissionPolicy.Admission second = policy.acquire();
    second.close();
  }

  @Test
  void testQuarkusHeartbeatSchedulerSchedulesAndCancelsHeartbeats() throws Exception {
    QuarkusHeartbeatScheduler scheduler = new QuarkusHeartbeatScheduler();
    CountDownLatch heartbeat = new CountDownLatch(1);

    HeartbeatScheduler.Cancellable cancellable =
        scheduler.scheduleFixedRate(1, heartbeat::countDown);

    try {
      assertTrue(
          heartbeat.await(2, TimeUnit.SECONDS), "heartbeat should run within the minimum interval");
      cancellable.cancel();
    } finally {
      scheduler.shutdown();
    }
  }

  @Test
  void testInMemoryJobStoreReplaysEventsTracksLifecycleAndValidatesRunIds() {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID jobId = store.create(2, "run-1");
    store.emit(jobId, JobEvent.log("stdout", "line-1"));
    store.markStarted(jobId, Instant.parse("2026-01-01T00:00:01Z"));
    store.markFinished(jobId, "SUCCEEDED", Instant.parse("2026-01-01T00:00:02Z"), 0);

    AssertSubscriber<JobEvent> subscriber =
        store.events(jobId).subscribe().withSubscriber(AssertSubscriber.create(20));
    subscriber.awaitCompletion();

    List<JobEvent> events = subscriber.getItems();
    List<String> eventTypes = events.stream().map(JobEvent::type).toList();

    assertTrue(eventTypes.contains("status"), "replayed events should include status updates");
    assertTrue(eventTypes.contains("summary"), "replayed events should include a job summary");
    assertTrue(
        eventTypes.contains("terminalSummary"),
        "replayed events should include the terminal summary");
    assertEquals(
        "line-1", store.status(jobId).lastLine(), "the snapshot should retain the last log line");
    assertEquals(
        "SUCCEEDED", store.status(jobId).status(), "the snapshot should record job success");
    assertEquals(
        0, store.status(jobId).exitCode(), "the snapshot should record the process exit code");

    store.validateRunId(jobId, null);
    store.validateRunId(jobId, "run-1");

    JobRunConflictException wrongRun =
        assertThrows(
            JobRunConflictException.class,
            () -> store.validateRunId(jobId, "run-2"),
            "a run ID that differs from the stored run ID should be rejected");
    assertEquals("stale_run", wrongRun.errorCode(), "a mismatched run ID should report stale_run");

    UUID noRunIdJob = store.create(1, null);
    JobRunConflictException staleRun =
        assertThrows(
            JobRunConflictException.class,
            () -> store.validateRunId(noRunIdJob, "run-1"),
            "a supplied run ID should be rejected when the job has no stored run ID");
    assertEquals("stale_run", staleRun.errorCode(), "an unexpected run ID should report stale_run");

    UUID unknownJobId = UUID.randomUUID();
    assertThrows(
        IllegalArgumentException.class,
        () -> store.status(unknownJobId),
        "requesting the status of an unknown job should fail");
  }

  @Test
  void testInMemoryJobStoreBuffersOnlyRecentEventsAndJobTerminalStatusCoversAllOutcomes() {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID jobId = store.create(100, null);

    for (int i = 0; i < 105; i++) {
      store.emit(jobId, JobEvent.log("stdout", "line-" + i));
    }

    List<JobEvent> replayed =
        store.events(jobId).select().first(100).collect().asList().await().indefinitely();

    assertFalse(
        replayed.stream().anyMatch(event -> "line-0".equals(event.message())),
        "the oldest log line should be evicted when the buffer is full");
    assertTrue(
        replayed.stream().anyMatch(event -> "line-104".equals(event.message())),
        "the newest log line should remain in the replay buffer");

    assertEquals(
        JobStatus.CANCELED,
        JobTerminalStatus.from(true, 0),
        "cancellation should take precedence over a successful exit code");
    assertEquals(
        JobStatus.FAILED,
        JobTerminalStatus.from(false, 7),
        "a nonzero exit code should fail a job that was not canceled");
  }

  @Test
  void testJobStoreEventPublisherDelegatesToUnderlyingStore() {
    AtomicReference<UUID> emittedJobId = new AtomicReference<>();
    AtomicReference<JobEvent> emittedEvent = new AtomicReference<>();

    JobStore store =
        new JobStore() {
          @Override
          public UUID create(int maxBufferLines, String runId) {
            return UUID.randomUUID();
          }

          @Override
          public JobStatusSnapshot status(UUID jobId) {
            throw new UnsupportedOperationException();
          }

          @Override
          public Multi<JobEvent> events(UUID jobId) {
            throw new UnsupportedOperationException();
          }

          @Override
          public void emit(UUID jobId, JobEvent event) {
            emittedJobId.set(jobId);
            emittedEvent.set(event);
          }

          @Override
          public void markStarted(UUID jobId, Instant startedAt) {
            throw new UnsupportedOperationException();
          }

          @Override
          public void markFinished(
              UUID jobId, String status, Instant finishedAt, Integer exitCode) {
            throw new UnsupportedOperationException();
          }

          @Override
          public void validateRunId(UUID jobId, String runId) {
            throw new UnsupportedOperationException();
          }
        };

    JobStoreEventPublisher publisher = new JobStoreEventPublisher(store);
    UUID jobId = UUID.randomUUID();
    JobEvent event = JobEvent.status("RUNNING");

    publisher.publish(jobId, event);

    assertEquals(jobId, emittedJobId.get(), "the publisher should forward the job ID to the store");
    assertEquals(event, emittedEvent.get(), "the publisher should forward the event to the store");
  }

  @Test
  void testProcessCommandRunnerCapturesStdoutStderrAndEnvironment() throws Exception {
    Path source = tempDir.resolve("EchoProgram.java");
    Files.writeString(
        source,
        """
      public class EchoProgram {
        public static void main(String[] args) {
          System.out.println("stdout:" + System.getenv("ORCH_TEST_ENV"));
          System.err.println("stderr:" + args[0]);
        }
      }
      """);

    ProcessCommandRunner runner = new ProcessCommandRunner();
    List<JobEvent> events = new ArrayList<>();

    CommandRunner.ExecutionResult result =
        runner.run(
            List.of(javaExecutable().toString(), source.toString(), "ARG"),
            tempDir.toString(),
            Map.of("ORCH_TEST_ENV", "VALUE"),
            events::add);

    assertEquals(0, result.exitCode(), "the echo program should exit successfully");
    assertNotNull(result.finishedAt(), "the runner should record when the process finished");
    assertEquals("status", events.getFirst().type(), "the runner should emit a status event first");
    assertTrue(
        events.getFirst().message().startsWith("EXEC "),
        "the initial status should describe the command being executed");
    assertTrue(
        events.stream()
            .anyMatch(
                e ->
                    "log".equals(e.type())
                        && "stdout".equals(e.stream())
                        && "stdout:VALUE".equals(e.message())),
        "stdout should contain the environment value passed to the process");
    assertTrue(
        events.stream()
            .anyMatch(
                e ->
                    "log".equals(e.type())
                        && "stderr".equals(e.stream())
                        && e.message().startsWith("stderr:")),
        "stderr should be captured in a separate log event");
  }

  @Test
  void testProcessCommandRunnerRejectsNullInputs() {
    ProcessCommandRunner runner = new ProcessCommandRunner();
    List<String> argv = List.of("cmd");
    String workspace = tempDir.toString();
    Map<String, String> envOverrides = Map.of();

    assertAll(
        () ->
            assertThrows(
                NullPointerException.class,
                () -> runner.run(null, workspace, envOverrides, JobInfrastructureTest::ignoreEvent),
                "null command arguments should be rejected"),
        () ->
            assertThrows(
                NullPointerException.class,
                () -> runner.run(argv, null, envOverrides, JobInfrastructureTest::ignoreEvent),
                "a null workspace should be rejected"),
        () ->
            assertThrows(
                NullPointerException.class,
                () -> runner.run(argv, workspace, null, JobInfrastructureTest::ignoreEvent),
                "null environment overrides should be rejected"),
        () ->
            assertThrows(
                NullPointerException.class,
                () -> runner.run(argv, workspace, envOverrides, null),
                "a null event sink should be rejected"));
  }

  @Test
  void testProcessCommandRunnerWaitsForDestroyedProcessAfterInterrupt() {
    FakeInterruptibleProcess process = new FakeInterruptibleProcess();
    ProcessCommandRunner runner =
        new ProcessCommandRunner() {
          @Override
          Process startProcess(ProcessBuilder processBuilder) {
            return process;
          }
        };

    InterruptedException ex =
        assertThrows(
            InterruptedException.class,
            () ->
                runner.run(
                    List.of("fake-command"),
                    tempDir.toString(),
                    Map.of("ORCH_TEST_ENV", "VALUE"),
                    JobInfrastructureTest::ignoreEvent),
            "the runner should propagate interruption while waiting for the process");

    assertEquals(
        "wait interrupted",
        ex.getMessage(),
        "the original interruption message should be preserved");
    assertTrue(process.destroyed.get(), "child process should be forcibly destroyed");
    assertTrue(
        process.timedWaitCalled.get(),
        "runner should wait briefly for the destroyed process to terminate");
    assertTrue(Thread.interrupted(), "interrupt status should be restored for the caller");
  }

  private static void ignoreEvent(JobEvent ignored) {
    // These tests exercise validation and interruption without inspecting emitted events.
  }

  private static final class FakeInterruptibleProcess extends Process {

    private final AtomicBoolean destroyed = new AtomicBoolean(false);
    private final AtomicBoolean timedWaitCalled = new AtomicBoolean(false);

    @Override
    public OutputStream getOutputStream() {
      return OutputStream.nullOutputStream();
    }

    @Override
    public InputStream getInputStream() {
      return InputStream.nullInputStream();
    }

    @Override
    public InputStream getErrorStream() {
      return InputStream.nullInputStream();
    }

    @Override
    public int waitFor() throws InterruptedException {
      throw new InterruptedException("wait interrupted");
    }

    @Override
    public boolean waitFor(long timeout, TimeUnit unit) {
      timedWaitCalled.set(true);
      return true;
    }

    @Override
    public int exitValue() {
      throw new IllegalThreadStateException("process still running");
    }

    @Override
    public Process destroyForcibly() {
      destroyed.set(true);
      return this;
    }

    @Override
    public void destroy() {
      destroyed.set(true);
    }

    @Override
    public boolean isAlive() {
      return !destroyed.get();
    }
  }

  private static Path javaExecutable() {
    String executable =
        System.getProperty("os.name").toLowerCase().contains("win") ? "java.exe" : "java";
    return Path.of(System.getProperty("java.home"), "bin", executable);
  }
}
