package io.github.georgecodes.benchmarking.orchestrator.resource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.github.georgecodes.benchmarking.orchestrator.api.HealthAggregateResponse;
import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import io.github.georgecodes.benchmarking.orchestrator.api.JobStatusResponse;
import io.github.georgecodes.benchmarking.orchestrator.api.RunRequest;
import io.github.georgecodes.benchmarking.orchestrator.application.BenchmarkTargetsService;
import io.github.georgecodes.benchmarking.orchestrator.application.BuilderCommandValidator;
import io.github.georgecodes.benchmarking.orchestrator.application.BuildxCommandValidator;
import io.github.georgecodes.benchmarking.orchestrator.application.CommandGroupValidator;
import io.github.georgecodes.benchmarking.orchestrator.application.CommandGroupValidatorRegistry;
import io.github.georgecodes.benchmarking.orchestrator.application.CommandPolicy;
import io.github.georgecodes.benchmarking.orchestrator.application.ComposeCommandValidator;
import io.github.georgecodes.benchmarking.orchestrator.application.EnvFileService;
import io.github.georgecodes.benchmarking.orchestrator.application.JobManager;
import io.github.georgecodes.benchmarking.orchestrator.application.ProjectPathsConfig;
import io.github.georgecodes.benchmarking.orchestrator.application.RunPreset;
import io.github.georgecodes.benchmarking.orchestrator.application.RunPresetService;
import io.github.georgecodes.benchmarking.orchestrator.application.ServiceHealthConfig;
import io.github.georgecodes.benchmarking.orchestrator.application.ServiceHealthService;
import io.github.georgecodes.benchmarking.orchestrator.application.health.HealthProbeClient;
import io.github.georgecodes.benchmarking.orchestrator.application.health.ServiceHealth;
import io.github.georgecodes.benchmarking.orchestrator.application.job.CommandRunner;
import io.github.georgecodes.benchmarking.orchestrator.application.job.HeartbeatScheduler;
import io.github.georgecodes.benchmarking.orchestrator.application.job.InMemoryJobStore;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobAdmissionPolicy;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobStatusSnapshot;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import io.vertx.core.Vertx;
import jakarta.ws.rs.BadRequestException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.jspecify.annotations.NonNull;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class ResourceUnitTest {

  private Vertx vertxToClose;

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

    EnvFileService service =
        new EnvFileService(emptyPathsConfig()) {
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
    assertEquals(
        "backup",
        resource.updateEnvFile(new EnvResource.EnvUpdateRequest("B=2\n")).backupFilename());
    assertEquals("B=2\n", updated.get());
    assertThrows(BadRequestException.class, () -> resource.updateEnvFile(null));
    assertThrows(
        BadRequestException.class,
        () -> resource.updateEnvFile(new EnvResource.EnvUpdateRequest(null)));
  }

  @Test
  void benchmarkTargetsResourceDelegatesAndValidatesRequest() {
    BenchmarkTargetsService.BenchmarkTargetsContent content =
        new BenchmarkTargetsService.BenchmarkTargetsContent(
            List.of("https://one.example"), "/tmp/benchmark-targets.txt");
    AtomicReference<List<String>> updated = new AtomicReference<>();

    BenchmarkTargetsResource resource = getBenchmarkTargetsResource(content, updated);

    assertEquals(content, resource.getTargets());
    assertEquals(
        "backup",
        resource
            .updateTargets(
                new BenchmarkTargetsResource.BenchmarkTargetsUpdateRequest(
                    List.of("https://two.example")))
            .backupFilename());
    assertEquals(List.of("https://two.example"), updated.get());
    assertThrows(BadRequestException.class, () -> resource.updateTargets(null));
    assertThrows(
        BadRequestException.class,
        () ->
            resource.updateTargets(
                new BenchmarkTargetsResource.BenchmarkTargetsUpdateRequest(null)));
  }

  private static @NonNull BenchmarkTargetsResource getBenchmarkTargetsResource(
      BenchmarkTargetsService.BenchmarkTargetsContent content,
      AtomicReference<List<String>> updated) {
    BenchmarkTargetsService service =
        new BenchmarkTargetsService(emptyPathsConfig()) {
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

    return new BenchmarkTargetsResource(service);
  }

  @Test
  void presetCommandsResourceDelegatesToService() {
    RunPresetService service =
        new RunPresetService(emptyPathsConfig()) {
          @Override
          public List<RunPreset> listPresets() {
            return List.of(
                new RunPreset("build-img", "Build", "docker buildx build .", ".run/build.run.xml"));
          }
        };

    PresetCommandsResource resource = new PresetCommandsResource(service);

    assertEquals(1, resource.list().size());
    assertEquals("Build", resource.list().getFirst().title());
  }

  @Test
  void healthResourceReturnsUnderlyingAggregate() {
    vertxToClose = Vertx.vertx();
    HealthProbeClient probeClient =
        (endpoint, _) ->
            Uni.createFrom()
                .item(
                    new ServiceHealth(
                        endpoint.name(), "up", 200, 1L, null, endpoint.baseUrl(), null));
    ServiceHealthService service = new ServiceHealthService(emptyHealthConfig(), probeClient);
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

    CommandPolicy policy =
        new CommandPolicy(emptyPathsConfig(), emptyCommandGroupValidatorRegistry()) {
          @Override
          public ValidatedCommand validate(String raw) {
            validatedCommand.set(raw);
            return new ValidatedCommand(
                List.of("docker", "ps"), "C:/workspace", "C:/workspace/compose");
          }
        };

    JobStatusSnapshot statusResponse =
        new JobStatusSnapshot(
            jobId, "RUNNING", Instant.parse("2026-01-01T00:00:00Z"), null, null, null, null);
    JobManager manager =
        new JobManager(
            10,
            1000,
            noOpScheduler(),
            noOpAdmissionPolicy(),
            successfulRunner(),
            new InMemoryJobStore(),
            (ignoredJobId, ignoredEvent) -> {}) {
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
          public JobStatusSnapshot status(UUID id) {
            return statusResponse;
          }

          @Override
          public Multi<io.github.georgecodes.benchmarking.orchestrator.application.job.JobEvent>
              events(UUID id) {
            return Multi.createFrom()
                .items(
                    io.github.georgecodes.benchmarking.orchestrator.application.job.JobEvent.status(
                        "QUEUED"),
                    io.github.georgecodes.benchmarking.orchestrator.application.job.JobEvent
                        .terminalSummary(
                            jobId,
                            "SUCCEEDED",
                            Instant.now(),
                            Instant.now(),
                            Instant.now(),
                            0,
                            "done"));
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

    assertEquals(JobStatusResponse.from(statusResponse), resource.status(jobId, "run-1"));
    assertEquals(jobId, validatedJobId.get());
    assertEquals("run-1", validatedRunId.get());

    List<JobEvent> events =
        resource.events(jobId, "run-1").collect().asList().await().indefinitely();
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

  private static ProjectPathsConfig emptyPathsConfig() {
    ProjectPathsConfig.Workspace workspace =
        new ProjectPathsConfig.Workspace() {
          @Override
          public String root() {
            return "/workspace";
          }

          @Override
          public String compose() {
            return "/workspace/compose";
          }

          @Override
          public String env() {
            return "/workspace/compose/.env";
          }

          @Override
          public String benchmarkTargets() {
            return "/workspace/config/benchmark-targets.txt";
          }
        };

    return new ProjectPathsConfig() {
      @Override
      public Optional<String> hostCompose() {
        return Optional.empty();
      }

      @Override
      public Workspace workspace() {
        return workspace;
      }
    };
  }

  private static CommandGroupValidatorRegistry emptyCommandGroupValidatorRegistry() {
    ProjectPathsConfig paths = emptyPathsConfig();
    List<CommandGroupValidator> validators =
        List.of(
            new ComposeCommandValidator(paths),
            new BuildxCommandValidator(paths),
            new BuilderCommandValidator(paths));
    return new CommandGroupValidatorRegistry(validators);
  }

  private static HeartbeatScheduler noOpScheduler() {
    return (intervalMs, task) -> {
      assertTrue(intervalMs > 0);
      assertNotNull(task);
      return () -> {};
    };
  }

  private static JobAdmissionPolicy noOpAdmissionPolicy() {
    return () -> () -> {};
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
