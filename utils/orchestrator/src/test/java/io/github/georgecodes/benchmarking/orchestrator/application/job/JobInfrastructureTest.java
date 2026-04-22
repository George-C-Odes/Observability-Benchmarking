package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.ErrorResponse;
import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import io.smallrye.mutiny.helpers.test.AssertSubscriber;
import jakarta.ws.rs.ClientErrorException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class JobInfrastructureTest {

  @TempDir
  Path tempDir;

  @Test
  void singleFlightAdmissionPolicyAllowsOneAtATimeAndReleasesOnClose() {
    SingleFlightJobAdmissionPolicy policy = new SingleFlightJobAdmissionPolicy();

    JobAdmissionPolicy.Admission admission = policy.acquire();
    assertThrows(jakarta.ws.rs.ServiceUnavailableException.class, policy::acquire);

    admission.close();

    JobAdmissionPolicy.Admission second = policy.acquire();
    second.close();
  }

  @Test
  void inMemoryJobStoreReplaysEventsTracksLifecycleAndValidatesRunIds() {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID jobId = store.create(2, "run-1");
    store.emit(jobId, JobEvent.log("stdout", "line-1"));
    store.markStarted(jobId, java.time.Instant.parse("2026-01-01T00:00:01Z"));
    store.markFinished(jobId, "SUCCEEDED", java.time.Instant.parse("2026-01-01T00:00:02Z"), 0);

    AssertSubscriber<JobEvent> subscriber = store.events(jobId)
      .subscribe().withSubscriber(AssertSubscriber.create(20));
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

    ClientErrorException wrongRun = assertThrows(ClientErrorException.class, () -> store.validateRunId(jobId, "run-2"));
    assertEquals(409, wrongRun.getResponse().getStatus());
    assertEquals("stale_run", ((ErrorResponse) wrongRun.getResponse().getEntity()).error());

    UUID noRunIdJob = store.create(1, null);
    ClientErrorException staleRun = assertThrows(ClientErrorException.class, () -> store.validateRunId(noRunIdJob, "run-1"));
    assertEquals(409, staleRun.getResponse().getStatus());

    assertThrows(IllegalArgumentException.class, () -> store.status(UUID.randomUUID()));
  }

  @Test
  void inMemoryJobStoreBuffersOnlyRecentEventsAndJobTerminalStatusCoversAllOutcomes() {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID jobId = store.create(100, null);

    for (int i = 0; i < 105; i++) {
      store.emit(jobId, JobEvent.log("stdout", "line-" + i));
    }

    List<JobEvent> replayed = store.events(jobId)
      .select().first(100)
      .collect().asList()
      .await().indefinitely();

    assertFalse(replayed.stream().anyMatch(event -> "line-0".equals(event.message())));
    assertTrue(replayed.stream().anyMatch(event -> "line-104".equals(event.message())));

    assertEquals(io.github.georgecodes.benchmarking.orchestrator.domain.JobStatus.CANCELED,
      JobTerminalStatus.from(true, 0));
    assertEquals(io.github.georgecodes.benchmarking.orchestrator.domain.JobStatus.FAILED,
      JobTerminalStatus.from(false, 7));
  }

  @Test
  void jobStoreEventPublisherDelegatesToUnderlyingStore() {
    AtomicReference<UUID> emittedJobId = new AtomicReference<>();
    AtomicReference<JobEvent> emittedEvent = new AtomicReference<>();

    JobStore store = new JobStore() {
      @Override
      public UUID create(int maxBufferLines, String runId) {
        return UUID.randomUUID();
      }

      @Override
      public io.github.georgecodes.benchmarking.orchestrator.api.JobStatusResponse status(UUID jobId) {
        throw new UnsupportedOperationException();
      }

      @Override
      public io.smallrye.mutiny.Multi<JobEvent> events(UUID jobId) {
        throw new UnsupportedOperationException();
      }

      @Override
      public void emit(UUID jobId, JobEvent event) {
        emittedJobId.set(jobId);
        emittedEvent.set(event);
      }

      @Override
      public void markStarted(UUID jobId, java.time.Instant startedAt) {
        throw new UnsupportedOperationException();
      }

      @Override
      public void markFinished(UUID jobId, String status, java.time.Instant finishedAt, Integer exitCode) {
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
    Files.writeString(source, """
      public class EchoProgram {
        public static void main(String[] args) {
          System.out.println("stdout:" + System.getenv("ORCH_TEST_ENV"));
          System.err.println("stderr:" + args[0]);
        }
      }
      """);

    ProcessCommandRunner runner = new ProcessCommandRunner();
    List<JobEvent> events = new ArrayList<>();

    CommandRunner.ExecutionResult result = runner.run(
      List.of(javaExecutable().toString(), source.toString(), "ARG"),
      tempDir.toString(),
      Map.of("ORCH_TEST_ENV", "VALUE"),
      events::add
    );

    assertEquals(0, result.exitCode());
    assertNotNull(result.finishedAt());
    assertEquals("status", events.getFirst().type());
    assertTrue(events.getFirst().message().startsWith("EXEC "));
    assertTrue(events.stream().anyMatch(e -> "log".equals(e.type()) && "stdout".equals(e.stream()) && "stdout:VALUE".equals(e.message())));
    assertTrue(events.stream().anyMatch(e -> "log".equals(e.type()) && "stderr".equals(e.stream()) && e.message().startsWith("stderr:")));
  }

  @Test
  void processCommandRunnerRejectsNullInputs() {
    ProcessCommandRunner runner = new ProcessCommandRunner();

    assertAll(
      () -> assertThrows(NullPointerException.class, () -> runner.run(null, tempDir.toString(), Map.of(), JobInfrastructureTest::ignoreEvent)),
      () -> assertThrows(NullPointerException.class, () -> runner.run(List.of("cmd"), null, Map.of(), JobInfrastructureTest::ignoreEvent)),
      () -> assertThrows(NullPointerException.class, () -> runner.run(List.of("cmd"), tempDir.toString(), null, JobInfrastructureTest::ignoreEvent)),
      () -> assertThrows(NullPointerException.class, () -> runner.run(List.of("cmd"), tempDir.toString(), Map.of(), null))
    );
  }

  private static void ignoreEvent(JobEvent ignored) {
  }

  private static Path javaExecutable() {
    String executable = System.getProperty("os.name").toLowerCase().contains("win") ? "java.exe" : "java";
    return Path.of(System.getProperty("java.home"), "bin", executable);
  }
}

