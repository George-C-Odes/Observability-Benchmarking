package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.api.CommandPreset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class ApplicationServicesTest {

  @TempDir
  Path tempDir;

  @Test
  void envFileServiceReadsUpdatesAndBacksUpFiles() throws Exception {
    Path envFile = tempDir.resolve("compose.env");
    Files.writeString(envFile, "OLD=1\n");

    EnvFileService service = new EnvFileService();
    service.paths = pathsConfig(tempDir, envFile, tempDir.resolve("benchmark-targets.txt"), null);

    EnvFileService.EnvFileContent read = service.readEnvFile();
    assertEquals("OLD=1\n", read.content());
    assertEquals(envFile.toAbsolutePath().toString(), read.absolutePath());

    EnvFileService.EnvFileUpdate update = service.updateEnvFile("NEW=2\n");
    assertEquals("Environment file updated successfully", update.message());
    assertTrue(update.backupFilename().startsWith("compose.env.backup."));
    assertEquals("NEW=2\n", Files.readString(envFile));
    assertEquals("OLD=1\n", Files.readString(envFile.resolveSibling(update.backupFilename())));
  }

  @Test
  void envFileServiceRejectsMissingEmptyAndUnreadableFiles() throws Exception {
    Path missing = tempDir.resolve("missing.env");
    EnvFileService service = new EnvFileService();
    service.paths = pathsConfig(tempDir, missing, tempDir.resolve("targets.txt"), null);

    EnvFileService.EnvFileException missingEx = assertThrows(
      EnvFileService.EnvFileException.class,
      service::readEnvFile
    );
    assertEquals(ServiceException.Type.NOT_FOUND, missingEx.getType());

    EnvFileService.EnvFileException emptyEx = assertThrows(
      EnvFileService.EnvFileException.class,
      () -> service.updateEnvFile("")
    );
    assertEquals(ServiceException.Type.VALIDATION_ERROR, emptyEx.getType());

    Path directory = tempDir.resolve("env-dir");
    Files.createDirectory(directory);
    service.paths = pathsConfig(tempDir, directory, tempDir.resolve("targets.txt"), null);

    EnvFileService.EnvFileException ioEx = assertThrows(
      EnvFileService.EnvFileException.class,
      service::readEnvFile
    );
    assertEquals(ServiceException.Type.IO_ERROR, ioEx.getType());
  }

  @Test
  void benchmarkTargetsServiceReadsUpdatesAndPreservesHeaderComments() throws Exception {
    Path targetsFile = tempDir.resolve("benchmark-targets.txt");
    Files.writeString(targetsFile, "# header\n\nhttp://one.example\n# ignored inline comment\nhttps://two.example\n");

    BenchmarkTargetsService service = new BenchmarkTargetsService();
    service.paths = pathsConfig(tempDir, tempDir.resolve("compose.env"), targetsFile, null);

    BenchmarkTargetsService.BenchmarkTargetsContent read = service.readTargets();
    assertEquals(List.of("http://one.example", "https://two.example"), read.urls());
    assertEquals(targetsFile.toAbsolutePath().toString(), read.absolutePath());

    BenchmarkTargetsService.BenchmarkTargetsUpdate update = service.updateTargets(List.of(
      "https://three.example",
      "http://four.example"
    ));

    assertEquals("Benchmark targets updated successfully (2 URLs)", update.message());
    assertTrue(update.backupFilename().startsWith("benchmark-targets.txt.backup."));
    assertEquals(
      "# header\n\nhttps://three.example\nhttp://four.example\n",
      Files.readString(targetsFile)
    );
    assertTrue(Files.exists(targetsFile.resolveSibling(update.backupFilename())));
  }

  @Test
  void benchmarkTargetsServiceRejectsInvalidMissingAndUnreadableInputs() throws Exception {
    BenchmarkTargetsService service = new BenchmarkTargetsService();
    Path missing = tempDir.resolve("missing-targets.txt");
    service.paths = pathsConfig(tempDir, tempDir.resolve("compose.env"), missing, null);

    BenchmarkTargetsService.BenchmarkTargetsException missingEx = assertThrows(
      BenchmarkTargetsService.BenchmarkTargetsException.class,
      service::readTargets
    );
    assertEquals(ServiceException.Type.NOT_FOUND, missingEx.getType());

    assertEquals(ServiceException.Type.VALIDATION_ERROR, assertThrows(
      BenchmarkTargetsService.BenchmarkTargetsException.class,
      () -> service.updateTargets(null)
    ).getType());
    assertEquals(ServiceException.Type.VALIDATION_ERROR, assertThrows(
      BenchmarkTargetsService.BenchmarkTargetsException.class,
      () -> service.updateTargets(List.of(" "))
    ).getType());
    assertEquals(ServiceException.Type.VALIDATION_ERROR, assertThrows(
      BenchmarkTargetsService.BenchmarkTargetsException.class,
      () -> service.updateTargets(List.of("ftp://example.com"))
    ).getType());
    assertEquals(ServiceException.Type.VALIDATION_ERROR, assertThrows(
      BenchmarkTargetsService.BenchmarkTargetsException.class,
      () -> service.updateTargets(List.of("://bad"))
    ).getType());

    Path directory = tempDir.resolve("targets-dir");
    Files.createDirectory(directory);
    service.paths = pathsConfig(tempDir, tempDir.resolve("compose.env"), directory, null);

    BenchmarkTargetsService.BenchmarkTargetsException ioEx = assertThrows(
      BenchmarkTargetsService.BenchmarkTargetsException.class,
      service::readTargets
    );
    assertEquals(ServiceException.Type.IO_ERROR, ioEx.getType());
  }

  @Test
  void runPresetServiceListsSupportedPresetsAndSkipsBrokenFiles() throws Exception {
    Path workspace = tempDir.resolve("workspace");
    Path runDir = workspace.resolve(".run");
    Files.createDirectories(runDir);

    Files.writeString(runDir.resolve("[build-img] Build Sample.run.xml"), """
      <component name="ProjectRunConfigurationManager">
        <configuration default="false" name="[build-img] Build Sample" type="docker-deploy">
          <deployment type="dockerfile">
            <settings>
              <option name="imageTag" value="local/sample:dev"/>
              <option name="sourceFilePath" value="/workspace/services/sample/Dockerfile"/>
            </settings>
          </deployment>
        </configuration>
      </component>
      """);
    Files.writeString(runDir.resolve("[multi-cont] Start Stack.run.xml"), """
      <component name="ProjectRunConfigurationManager">
        <configuration default="false" name="[multi-cont] Start Stack" type="ShConfigurationType">
          <option name="SCRIPT_TEXT"><![CDATA[
            docker compose --project-directory $PROJECT_DIR$/compose up -d
          ]]></option>
        </configuration>
      </component>
      """);
    Files.writeString(runDir.resolve("[single-cont] Unsupported.run.xml"), """
      <component name="ProjectRunConfigurationManager">
        <configuration default="false" name="[single-cont] Unsupported" type="ShConfigurationType">
          <option name="SCRIPT_TEXT" value="echo not docker"/>
        </configuration>
      </component>
      """);
    Files.writeString(runDir.resolve("[single-cont] Broken.run.xml"), "<component>");
    Files.writeString(runDir.resolve("ignored.txt"), "ignored");

    RunPresetService service = new RunPresetService();
    service.paths = pathsConfig(workspace, workspace.resolve("compose.env"), workspace.resolve("targets.txt"), null);

    List<CommandPreset> presets = service.listPresets();

    assertEquals(2, presets.size());
    assertEquals("build-img", presets.getFirst().category());
    assertEquals("Build Sample", presets.getFirst().title());
    assertEquals(".run/[build-img] Build Sample.run.xml", presets.getFirst().sourceFile());
    assertTrue(presets.getFirst().command().startsWith("docker buildx build --load -t local/sample:dev"));

    assertEquals("multi-cont", presets.get(1).category());
    assertEquals("Start Stack", presets.get(1).title());
    assertEquals(
      "docker compose --project-directory " + workspace + "/compose up -d",
      presets.get(1).command()
    );
  }

  @Test
  void runPresetServiceReturnsEmptyWhenRunDirectoryIsMissing() {
    RunPresetService service = new RunPresetService();
    service.paths = pathsConfig(tempDir.resolve("no-workspace"), tempDir.resolve("compose.env"), tempDir.resolve("targets.txt"), null);

    assertEquals(List.of(), service.listPresets());
  }

  @Test
  void commandPolicyCoversAdditionalComposeBuildxAndDockerBranches() throws Exception {
    Path workspace = tempDir.resolve("workspace-root");
    Files.createDirectories(workspace.resolve("compose"));

    CommandPolicy policy = new CommandPolicy();
    policy.paths = pathsConfig(
      workspace,
      workspace.resolve("compose/.env"),
      workspace.resolve("config/benchmark-targets.txt"),
      null
    );

    CommandPolicy.ValidatedCommand compose = policy.validate(
      "docker compose --compatibility --project-name demo version"
    );
    assertTrue(compose.argv().contains("--compatibility"));
    assertTrue(compose.argv().contains("--project-name"));

    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker compose --env-file version"));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker compose --compatibility=true version"));

    Path dockerfile = workspace.resolve("services/demo/Dockerfile");
    Files.createDirectories(dockerfile.getParent());
    Files.writeString(dockerfile, "FROM scratch\n");
    CommandPolicy.ValidatedCommand buildx = policy.validate(
      "docker buildx build -f " + dockerfile + " ."
    );
    assertEquals(List.of("docker", "buildx", "build", "-f", dockerfile.toString(), "."), buildx.argv());

    assertThrows(
      IllegalArgumentException.class,
      () -> policy.validate("docker buildx build -f " + tempDir.resolve("outside/Dockerfile") + " .")
    );

    assertEquals(
      List.of("docker", "images"),
      policy.validate("docker images").argv()
    );
    CommandPolicy.ValidatedCommand uncValidated = policy.validate("docker compose -f //server/share/docker-compose.yml version");
    assertContainsSubsequence(uncValidated.argv(), List.of("-f", "//server/share/docker-compose.yml", "version"));
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker unknown"));
  }

  @Test
  void commandPolicyAllowsHostComposePathsWhenConfigured() {
    Path workspace = tempDir.resolve("workspace-root");

    CommandPolicy policy = new CommandPolicy();
    policy.paths = pathsConfig(
      workspace,
      workspace.resolve("compose/.env"),
      workspace.resolve("config/benchmark-targets.txt"),
      "C:/host/compose"
    );

    CommandPolicy.ValidatedCommand validated = policy.validate(
      "docker compose --project-directory C:/host/compose -f C:/host/compose/docker-compose.yml version"
    );

    assertContainsSubsequence(validated.argv(), List.of("--project-directory", "C:/host/compose"));
    assertContainsSubsequence(validated.argv(), List.of("-f", "C:/host/compose/docker-compose.yml"));
    assertContainsSubsequence(validated.argv(), List.of("--env-file", workspace.resolve("compose/.env").toString()));
    assertEquals("version", validated.argv().getLast());
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

  private static ProjectPathsConfig pathsConfig(
    Path workspaceRoot,
    Path envPath,
    Path targetsPath,
    String hostCompose
  ) {
    ProjectPathsConfig.Workspace workspace = new ProjectPathsConfig.Workspace() {
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
        return envPath.toString();
      }

      @Override
      public String benchmarkTargets() {
        return targetsPath.toString();
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
}

