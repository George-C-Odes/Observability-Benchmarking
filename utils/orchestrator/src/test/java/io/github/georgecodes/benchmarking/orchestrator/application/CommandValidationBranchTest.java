package io.github.georgecodes.benchmarking.orchestrator.application;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CommandValidationBranchTest {

  @TempDir Path tempDir;

  @Test
  void builderValidatorCoversAllowedAliasesAndRejectionBranches() {
    CommandPolicy policy = commandPolicy(pathsConfig(tempDir, null));

    assertEquals(
        List.of("docker", "builder", "prune", "-a", "-f"),
        policy.validate("docker builder prune -a -f").argv());
    assertEquals(
        List.of("docker", "builder", "prune", "--all", "--force"),
        policy.validate("docker builder prune --all --force").argv());

    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker builder"));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker builder ls"));
    assertThrows(
        IllegalArgumentException.class, () -> policy.validate("docker builder prune --force"));
    assertThrows(
        IllegalArgumentException.class, () -> policy.validate("docker builder prune --all"));
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker builder prune --all --force --filter dangling=true"));
  }

  @Test
  void composeValidatorCoversGlobalOptionValueFormsDefaultsAndRejections() throws Exception {
    Path workspace = tempDir.resolve("workspace");
    Path compose = workspace.resolve("compose");
    Files.createDirectories(compose);
    Path composeFile = compose.resolve("docker-compose.yml");
    Path envFile = compose.resolve(".env");
    Files.writeString(composeFile, "services: {}\n");
    Files.writeString(envFile, "A=1\n");
    CommandPolicy policy = commandPolicy(pathsConfig(workspace, null));

    CommandPolicy.ValidatedCommand explicitPaths =
        policy.validate(
            "docker compose --project-directory "
                + compose
                + " --file "
                + composeFile
                + " --env-file "
                + envFile
                + " version");
    assertContainsSubsequence(
        explicitPaths.argv(), List.of("--project-directory", compose.toString()));
    assertContainsSubsequence(explicitPaths.argv(), List.of("--file", composeFile.toString()));
    assertContainsSubsequence(explicitPaths.argv(), List.of("--env-file", envFile.toString()));

    CommandPolicy.ValidatedCommand nonPathOptions =
        policy.validate(
            "docker compose --compatibility --profile=observability --project-name bench --ansi never --parallel 2 --progress plain version");
    assertContainsSubsequence(nonPathOptions.argv(), List.of("--profile=observability"));
    assertContainsSubsequence(nonPathOptions.argv(), List.of("--project-name", "bench"));
    assertContainsSubsequence(nonPathOptions.argv(), List.of("--ansi", "never"));
    assertContainsSubsequence(nonPathOptions.argv(), List.of("--parallel", "2"));
    assertContainsSubsequence(nonPathOptions.argv(), List.of("--progress", "plain"));

    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker compose"));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker compose --profile"));
    assertThrows(
        IllegalArgumentException.class, () -> policy.validate("docker compose --profile= version"));
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker compose --compatibility=true version"));
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker compose --context default version"));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker compose exec sh"));
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker compose --env-file ../outside.env version"));
  }

  @Test
  void composeValidatorAllowsConfiguredHostComposePathsButStillProtectsEnvFiles() {
    Path workspace = tempDir.resolve("workspace");
    CommandPolicy policy = commandPolicy(pathsConfig(workspace, "/host/compose"));

    CommandPolicy.ValidatedCommand longFile =
        policy.validate(
            "docker compose --project-directory /host/compose --file /host/compose/docker-compose.yml version");
    assertContainsSubsequence(longFile.argv(), List.of("--project-directory", "/host/compose"));
    assertContainsSubsequence(
        longFile.argv(), List.of("--file", "/host/compose/docker-compose.yml"));

    CommandPolicy.ValidatedCommand shortFile =
        policy.validate("docker compose -f /host/compose/other.yml version");
    assertContainsSubsequence(shortFile.argv(), List.of("-f", "/host/compose/other.yml"));

    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker compose --env-file /host/compose/.env version"));
  }

  @Test
  void buildxValidatorCoversSubcommandSearchAndFileOptionBranches() throws Exception {
    Path workspace = tempDir.resolve("workspace");
    Files.createDirectories(workspace.resolve("service"));
    Path dockerfile = workspace.resolve("service/Dockerfile");
    Files.writeString(dockerfile, "FROM scratch\n");
    CommandPolicy policy = commandPolicy(pathsConfig(workspace, null));

    assertEquals(List.of("docker", "buildx", "ls"), policy.validate("docker buildx ls").argv());
    assertEquals(
        List.of(
            "docker",
            "buildx",
            "--builder",
            "default",
            "build",
            "--file",
            dockerfile.toString(),
            "."),
        policy
            .validate("docker buildx --builder default build --file " + dockerfile + " .")
            .argv());
    assertEquals(
        List.of("docker", "buildx", "build", "--file"),
        policy.validate("docker buildx build --file").argv());

    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker buildx"));
    assertThrows(
        IllegalArgumentException.class, () -> policy.validate("docker buildx --builder default"));
  }

  @Test
  void commandPolicyCoversCommonSafetyRejectionBranches() {
    CommandPolicy policy = commandPolicy(pathsConfig(tempDir, null));

    assertEquals(List.of("docker", "version"), policy.validate("docker version").argv());
    assertThrows(IllegalArgumentException.class, () -> policy.validate(""));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("podman ps"));
    assertThrows(
        IllegalArgumentException.class, () -> policy.validate("docker --host tcp://127.0.0.1 ps"));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker ps;whoami"));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker ps|grep"));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker `whoami`"));
  }

  @Test
  void workspacePathValidatorCoversWindowsPathRecognitionBranches() {
    assertTrue(WorkspacePathValidator.isWindowsAbsolutePath("C:/workspace"));
    assertTrue(WorkspacePathValidator.isWindowsAbsolutePath("Z:\\workspace"));
    assertTrue(WorkspacePathValidator.isWindowsAbsolutePath("//server/share"));
    assertTrue(WorkspacePathValidator.isWindowsAbsolutePath("\\\\server\\share"));

    assertFalse(WorkspacePathValidator.isWindowsAbsolutePath(null));
    assertFalse(WorkspacePathValidator.isWindowsAbsolutePath("C:"));
    assertFalse(WorkspacePathValidator.isWindowsAbsolutePath("1:/workspace"));
    assertFalse(WorkspacePathValidator.isWindowsAbsolutePath("C|/workspace"));
    assertFalse(WorkspacePathValidator.isWindowsAbsolutePath("C:relative"));
    assertFalse(WorkspacePathValidator.isWindowsAbsolutePath("/unix/path"));
  }

  private static ProjectPathsConfig pathsConfig(Path workspaceRoot, String hostCompose) {
    ProjectPathsConfig.Workspace workspace =
        new ProjectPathsConfig.Workspace() {
          @Override
          public String root() {
            return workspaceRoot.toString();
          }

          @Override
          public String compose() {
            return workspaceRoot.resolve("compose").toString();
          }

          @Override
          public String env() {
            return workspaceRoot.resolve("compose/.env").toString();
          }

          @Override
          public String benchmarkTargets() {
            return workspaceRoot.resolve("config/benchmark-targets.txt").toString();
          }
        };

    return new ProjectPathsConfig() {
      @Override
      public Optional<String> hostCompose() {
        return Optional.ofNullable(hostCompose);
      }

      @Override
      public Workspace workspace() {
        return workspace;
      }
    };
  }

  private static CommandPolicy commandPolicy(ProjectPathsConfig paths) {
    Collection<CommandGroupValidator> validators =
        List.of(
            new ComposeCommandValidator(paths),
            new BuildxCommandValidator(paths),
            new BuilderCommandValidator(paths));
    return new CommandPolicy(paths, new CommandGroupValidatorRegistry(validators));
  }

  private static void assertContainsSubsequence(List<String> haystack, List<String> needle) {
    assertFalse(needle.isEmpty());

    for (int i = 0; i <= haystack.size() - needle.size(); i++) {
      boolean match = true;
      for (int j = 0; j < needle.size(); j++) {
        if (!needle.get(j).equals(haystack.get(i + j))) {
          match = false;
          break;
        }
      }
      if (match) {
        return;
      }
    }

    fail("Expected argv to contain subsequence " + needle + " but was " + haystack);
  }
}
