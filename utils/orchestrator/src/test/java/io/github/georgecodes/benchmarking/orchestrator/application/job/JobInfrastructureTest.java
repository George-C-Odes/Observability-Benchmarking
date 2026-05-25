package io.github.georgecodes.benchmarking.orchestrator.application.job;

import static org.junit.jupiter.api.Assertions.*;

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
  void singleFlightAdmissionPolicyAllowsOneAtATimeAndReleasesOnClose() {
    SingleFlightJobAdmissionPolicy policy = new SingleFlightJobAdmissionPolicy();

    JobAdmissionPolicy.Admission admission = policy.acquire();
    assertThrows(JobAdmissionRejectedException.class, policy::acquire);

    admission.close();

    JobAdmissionPolicy.Admission second = policy.acquire();
    second.close();
  }

  @Test
  void quarkusHeartbeatSchedulerSchedulesAndCancelsHeartbeats() throws Exception {
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
  void inMemoryJobStoreReplaysEventsTracksLifecycleAndValidatesRunIds() {
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

    assertTrue(eventTypes.contains("status"));
    assertTrue(eventTypes.contains("summary"));
    assertTrue(eventTypes.contains("terminalSummary"));
    assertEquals("line-1", store.status(jobId).lastLine());
    assertEquals("SUCCEEDED", store.status(jobId).status());
    assertEquals(0, store.status(jobId).exitCode());

    store.validateRunId(jobId, null);
    store.validateRunId(jobId, "run-1");

    JobRunConflictException wrongRun =
        assertThrows(JobRunConflictException.class, () -> store.validateRunId(jobId, "run-2"));
    assertEquals("stale_run", wrongRun.errorCode());

    UUID noRunIdJob = store.create(1, null);
    JobRunConflictException staleRun =
        assertThrows(JobRunConflictException.class, () -> store.validateRunId(noRunIdJob, "run-1"));
    assertEquals("stale_run", staleRun.errorCode());

    assertThrows(IllegalArgumentException.class, () -> store.status(UUID.randomUUID()));
  }

  @Test
  void inMemoryJobStoreBuffersOnlyRecentEventsAndJobTerminalStatusCoversAllOutcomes() {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID jobId = store.create(100, null);

    for (int i = 0; i < 105; i++) {
      store.emit(jobId, JobEvent.log("stdout", "line-" + i));
    }

    List<JobEvent> replayed =
        store.events(jobId).select().first(100).collect().asList().await().indefinitely();

    assertFalse(replayed.stream().anyMatch(event -> "line-0".equals(event.message())));
    assertTrue(replayed.stream().anyMatch(event -> "line-104".equals(event.message())));

    assertEquals(JobStatus.CANCELED, JobTerminalStatus.from(true, 0));
    assertEquals(JobStatus.FAILED, JobTerminalStatus.from(false, 7));
  }

  @Test
  void jobStoreEventPublisherDelegatesToUnderlyingStore() {
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

    assertEquals(jobId, emittedJobId.get());
    assertEquals(event, emittedEvent.get());
  }

  @Test
  void processCommandRunnerCapturesStdoutStderrAndEnvironment() throws Exception {
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

    assertEquals(0, result.exitCode());
    assertNotNull(result.finishedAt());
    assertEquals("status", events.getFirst().type());
    assertTrue(events.getFirst().message().startsWith("EXEC "));
    assertTrue(
        events.stream()
            .anyMatch(
                e ->
                    "log".equals(e.type())
                        && "stdout".equals(e.stream())
                        && "stdout:VALUE".equals(e.message())));
    assertTrue(
        events.stream()
            .anyMatch(
                e ->
                    "log".equals(e.type())
                        && "stderr".equals(e.stream())
                        && e.message().startsWith("stderr:")));
  }

  @Test
  void processCommandRunnerRejectsNullInputs() {
    ProcessCommandRunner runner = new ProcessCommandRunner();

    assertAll(
        () ->
            assertThrows(
                NullPointerException.class,
                () ->
                    runner.run(
                        null, tempDir.toString(), Map.of(), JobInfrastructureTest::ignoreEvent)),
        () ->
            assertThrows(
                NullPointerException.class,
                () ->
                    runner.run(List.of("cmd"), null, Map.of(), JobInfrastructureTest::ignoreEvent)),
        () ->
            assertThrows(
                NullPointerException.class,
                () ->
                    runner.run(
                        List.of("cmd"),
                        tempDir.toString(),
                        null,
                        JobInfrastructureTest::ignoreEvent)),
        () ->
            assertThrows(
                NullPointerException.class,
                () -> runner.run(List.of("cmd"), tempDir.toString(), Map.of(), null)));
  }

  @Test
  void processCommandRunnerWaitsForDestroyedProcessAfterInterrupt() {
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
                    JobInfrastructureTest::ignoreEvent));

    assertEquals("wait interrupted", ex.getMessage());
    assertTrue(process.destroyed.get(), "child process should be forcibly destroyed");
    assertTrue(
        process.timedWaitCalled.get(),
        "runner should wait briefly for the destroyed process to terminate");
    assertTrue(Thread.interrupted(), "interrupt status should be restored for the caller");
  }

  private static void ignoreEvent(JobEvent ignored) {}

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
