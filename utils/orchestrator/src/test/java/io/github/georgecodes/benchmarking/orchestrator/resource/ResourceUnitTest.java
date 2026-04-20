package io.github.georgecodes.benchmarking.orchestrator.resource;

import io.github.georgecodes.benchmarking.orchestrator.api.CommandPreset;
import io.github.georgecodes.benchmarking.orchestrator.api.HealthAggregateResponse;
import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import io.github.georgecodes.benchmarking.orchestrator.api.JobStatusResponse;
import io.github.georgecodes.benchmarking.orchestrator.api.RunRequest;
import io.github.georgecodes.benchmarking.orchestrator.application.BenchmarkTargetsService;
import io.github.georgecodes.benchmarking.orchestrator.application.CommandPolicy;
import io.github.georgecodes.benchmarking.orchestrator.application.EnvFileService;
import io.github.georgecodes.benchmarking.orchestrator.application.JobManager;
import io.github.georgecodes.benchmarking.orchestrator.application.RunPresetService;
import io.github.georgecodes.benchmarking.orchestrator.application.ServiceHealthConfig;
import io.github.georgecodes.benchmarking.orchestrator.application.ServiceHealthService;
import io.github.georgecodes.benchmarking.orchestrator.application.job.CommandRunner;
import io.github.georgecodes.benchmarking.orchestrator.application.job.HeartbeatScheduler;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobAdmissionPolicy;
import io.smallrye.mutiny.Multi;
import jakarta.ws.rs.BadRequestException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class ResourceUnitTest {

  private io.vertx.core.Vertx vertxToClose;

  @AfterEach
  void tearDown() {
    if (vertxToClose != null) {
      vertxToClose.close().toCompletionStage().toCompletableFuture().join();
      vertxToClose = null;
    }
  }

  @Test
  void envResourceDelegatesAndValidatesRequest() {
    EnvFileService.EnvFileContent content = new EnvFileService.EnvFileContent("A=1\n", "/tmp/.env");
    AtomicReference<String> updated = new AtomicReference<>();

    EnvFileService service = new EnvFileService() {
      @Override
      public EnvFileContent readEnvFile() {
        return content;
      }

      @Override
      public EnvFileUpdate updateEnvFile(String newContent) {
        updated.set(newContent);
        return new EnvFileUpdate("ok", "backup");
      }
    };

    EnvResource resource = new EnvResource(service);

    assertEquals(content, resource.getEnvFile());
    assertEquals("backup", resource.updateEnvFile(new EnvResource.EnvUpdateRequest("B=2\n")).backupFilename());
    assertEquals("B=2\n", updated.get());
    assertThrows(BadRequestException.class, () -> resource.updateEnvFile(null));
    assertThrows(BadRequestException.class, () -> resource.updateEnvFile(new EnvResource.EnvUpdateRequest(null)));
  }

  @Test
  void benchmarkTargetsResourceDelegatesAndValidatesRequest() {
    BenchmarkTargetsService.BenchmarkTargetsContent content = new BenchmarkTargetsService.BenchmarkTargetsContent(
      List.of("https://one.example"),
      "/tmp/benchmark-targets.txt"
    );
    AtomicReference<List<String>> updated = new AtomicReference<>();

    BenchmarkTargetsService service = new BenchmarkTargetsService() {
      @Override
      public BenchmarkTargetsContent readTargets() {
        return content;
      }

      @Override
      public BenchmarkTargetsUpdate updateTargets(List<String> urls) {
        updated.set(urls);
        return new BenchmarkTargetsUpdate("ok", "backup");
      }
    };

    BenchmarkTargetsResource resource = new BenchmarkTargetsResource(service);

    assertEquals(content, resource.getTargets());
    assertEquals("backup", resource.updateTargets(new BenchmarkTargetsResource.BenchmarkTargetsUpdateRequest(List.of("https://two.example"))).backupFilename());
    assertEquals(List.of("https://two.example"), updated.get());
    assertThrows(BadRequestException.class, () -> resource.updateTargets(null));
    assertThrows(BadRequestException.class, () -> resource.updateTargets(new BenchmarkTargetsResource.BenchmarkTargetsUpdateRequest(null)));
  }

  @Test
  void presetCommandsResourceDelegatesToService() {
    RunPresetService service = new RunPresetService() {
      @Override
      public List<CommandPreset> listPresets() {
        return List.of(new CommandPreset("build-img", "Build", "docker buildx build .", ".run/build.run.xml"));
      }
    };

    PresetCommandsResource resource = new PresetCommandsResource(service);

    assertEquals(1, resource.list().size());
    assertEquals("Build", resource.list().getFirst().title());
  }

  @Test
  void healthResourceReturnsUnderlyingAggregate() {
    vertxToClose = io.vertx.core.Vertx.vertx();
    ServiceHealthService service = new ServiceHealthService(
      new io.vertx.mutiny.core.Vertx(vertxToClose),
      emptyHealthConfig()
    );
    HealthResource resource = new HealthResource(service);

    HealthAggregateResponse response = resource.get(null).await().indefinitely();

    assertEquals(List.of(), response.services());
  }

  @Test
  void orchestratorResourceValidatesAndDelegatesAcrossRunStatusAndEvents() {
    UUID jobId = UUID.randomUUID();
    AtomicReference<String> validatedCommand = new AtomicReference<>();
    AtomicReference<CommandPolicy.ValidatedCommand> submittedCommand = new AtomicReference<>();
    AtomicReference<String> submittedRunId = new AtomicReference<>();
    AtomicReference<UUID> validatedJobId = new AtomicReference<>();
    AtomicReference<String> validatedRunId = new AtomicReference<>();

    CommandPolicy policy = new CommandPolicy() {
      @Override
      public ValidatedCommand validate(String raw) {
        validatedCommand.set(raw);
        return new ValidatedCommand(List.of("docker", "ps"), "C:/workspace", "C:/workspace/compose");
      }
    };

    JobStatusResponse statusResponse = new JobStatusResponse(
      jobId,
      "RUNNING",
      Instant.parse("2026-01-01T00:00:00Z"),
      null,
      null,
      null,
      null
    );
    JobManager manager = new JobManager(
      10,
      1000,
      noOpScheduler(),
      noOpAdmissionPolicy(),
      successfulRunner(),
      new io.github.georgecodes.benchmarking.orchestrator.application.job.InMemoryJobStore(),
      (ignoredJobId, ignoredEvent) -> { }
    ) {
      @Override
      public UUID submit(CommandPolicy.ValidatedCommand cmd, String runId) {
        submittedCommand.set(cmd);
        submittedRunId.set(runId);
        return jobId;
      }

      @Override
      public void validateRunId(UUID id, String runId) {
        validatedJobId.set(id);
        validatedRunId.set(runId);
      }

      @Override
      public JobStatusResponse status(UUID id) {
        return statusResponse;
      }

      @Override
      public Multi<JobEvent> events(UUID id) {
        return Multi.createFrom().items(
          JobEvent.status("QUEUED"),
          JobEvent.terminalSummary(jobId, "SUCCEEDED", Instant.now(), Instant.now(), Instant.now(), 0, "done")
        );
      }
    };

    OrchestratorResource resource = new OrchestratorResource(policy, manager);

    assertThrows(BadRequestException.class, () -> resource.run(null));
    assertThrows(BadRequestException.class, () -> resource.run(new RunRequest(" ", null)));

    var runResponse = resource.run(new RunRequest("docker ps", "run-1"));
    assertEquals(jobId, runResponse.jobId());
    assertEquals("run-1", runResponse.runId());
    assertEquals("docker ps", validatedCommand.get());
    assertEquals("run-1", submittedRunId.get());
    assertNotNull(submittedCommand.get());

    assertEquals(statusResponse, resource.status(jobId, "run-1"));
    assertEquals(jobId, validatedJobId.get());
    assertEquals("run-1", validatedRunId.get());

    List<JobEvent> events = resource.events(jobId, "run-1").collect().asList().await().indefinitely();
    assertEquals(2, events.size());
    assertEquals("terminalSummary", events.get(1).type());
  }

  private static ServiceHealthConfig emptyHealthConfig() {
    return new ServiceHealthConfig() {
      @Override
      public long timeoutMs() {
        return 1000;
      }

      @Override
      public int concurrency() {
        return 1;
      }

      @Override
      public Map<String, Service> services() {
        return Map.of();
      }
    };
  }

  private static HeartbeatScheduler noOpScheduler() {
    return (intervalMs, task) -> {
      assertTrue(intervalMs > 0);
      assertNotNull(task);
      return () -> { };
    };
  }

  private static JobAdmissionPolicy noOpAdmissionPolicy() {
    return () -> () -> { };
  }

  private static CommandRunner successfulRunner() {
    return (argv, workspace, envOverrides, sink) -> {
      assertNotNull(argv);
      assertNotNull(workspace);
      assertNotNull(envOverrides);
      assertNotNull(sink);
      return new CommandRunner.ExecutionResult(0, Instant.now());
    };
  }
}

