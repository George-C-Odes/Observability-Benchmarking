package io.github.georgecodes.benchmarking.orchestrator.domain;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.NonNull;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DomainUtilitiesTest {

  @TempDir Path tempDir;

  @Test
  void commandTokenizerHandlesNullQuotesEscapesAndWhitespace() {
    assertEquals(List.of(), CommandTokenizer.tokenize(null));
    assertEquals(List.of("docker", "ps"), CommandTokenizer.tokenize("  docker   ps  "));

    List<String> tokens =
        CommandTokenizer.tokenize(
            "docker compose --profile=OBS up -d \"service name\" 'quoted value' \"a\\\"b\"");

    assertEquals(
        List.of(
            "docker",
            "compose",
            "--profile=OBS",
            "up",
            "-d",
            "service name",
            "quoted value",
            "a\"b"),
        tokens);
  }

  @Test
  void commandTokenizerLeavesBackslashesOutsideQuotesUntouched() {
    assertEquals(
        List.of("docker", "compose", "-f", "C:\\repo\\docker-compose.yml", "version"),
        CommandTokenizer.tokenize("docker compose -f C:\\repo\\docker-compose.yml version"));
    assertEquals(
        List.of("cmd", "a b", "single \" double", "double ' single"),
        CommandTokenizer.tokenize("cmd 'a\\ b' 'single \" double' \"double ' single\""));
  }

  @Test
  void parseShellRunConfigAndExtractFirstDockerCommand() throws Exception {
    Path xml = tempDir.resolve("shell.run.xml");
    Files.writeString(
        xml,
        """
      <component name="ProjectRunConfigurationManager">
        <configuration default="false" name="[multi-cont] Start Stack" type="ShConfigurationType">
          <option name="SCRIPT_TEXT"><![CDATA[
            echo preparing
            docker compose --project-directory $PROJECT_DIR$/compose up -d
            docker ps
          ]]></option>
        </configuration>
      </component>
      """);

    IntelliJRunXmlParser.ParsedRunConfig cfg = IntelliJRunXmlParser.parse(xml);

    assertEquals("[multi-cont] Start Stack", cfg.name());
    assertEquals("ShConfigurationType", cfg.configType());
    assertNull(cfg.deploymentType());
    assertTrue(cfg.flatOptions().get("SCRIPT_TEXT").contains("docker compose"));
    assertEquals(List.of(), cfg.buildArgs());

    String command = IntelliJRunXmlParser.toDockerCommand(cfg, "/workspace");
    assertEquals("docker compose --project-directory /workspace/compose up -d", command);
  }

  @Test
  void parseDockerfileRunConfigBuildsBuildxCommandWithQuotedArguments() throws Exception {
    Path xml = tempDir.resolve("dockerfile.run.xml");
    Files.writeString(
        xml,
        """
      <component name="ProjectRunConfigurationManager">
        <configuration default="false" name="[build-img] Build Sample" type="docker-deploy">
          <deployment type="dockerfile">
            <settings>
              <option name="imageTag" value="local/sample:dev"/>
              <option name="sourceFilePath" value="/workspace/service dir/Dockerfile"/>
              <option name="buildArgs">
                <list>
                  <DockerEnvVarImpl>
                    <option name="name" value="HTTP_PORT"/>
                    <option name="value" value="8080"/>
                  </DockerEnvVarImpl>
                  <DockerEnvVarImpl>
                    <option name="name" value="GREETING"/>
                    <option name="value" value="hello world"/>
                  </DockerEnvVarImpl>
                  <DockerEnvVarImpl>
                    <option name="name" value=""/>
                    <option name="value" value="ignored"/>
                  </DockerEnvVarImpl>
                </list>
              </option>
            </settings>
          </deployment>
        </configuration>
      </component>
      """);

    IntelliJRunXmlParser.ParsedRunConfig cfg = IntelliJRunXmlParser.parse(xml);

    assertEquals("docker-deploy", cfg.configType());
    assertEquals("dockerfile", cfg.deploymentType());
    assertEquals(2, cfg.buildArgs().size());
    assertEquals(new IntelliJRunXmlParser.EnvVar("HTTP_PORT", "8080"), cfg.buildArgs().get(0));
    assertEquals(
        new IntelliJRunXmlParser.EnvVar("GREETING", "hello world"), cfg.buildArgs().get(1));

    String command = IntelliJRunXmlParser.toDockerCommand(cfg, "/workspace");
    String expectedContext = Path.of("/workspace/service dir/Dockerfile").getParent().toString();

    assertTrue(
        command.startsWith(
            "docker buildx build --load -t local/sample:dev -f \"/workspace/service dir/Dockerfile\""));
    assertTrue(command.contains("--build-arg HTTP_PORT=8080"));
    assertTrue(command.contains("--build-arg \"GREETING=hello world\""));
    assertTrue(command.endsWith("\"" + expectedContext + "\""));
  }

  @Test
  void parseDockerfileConfigWithoutSettingsSkipsMalformedOptionsAndEmptyBuildArgs()
      throws Exception {
    Path xml = tempDir.resolve("dockerfile-no-settings.run.xml");
    Files.writeString(
        xml,
        """
      <component name="ProjectRunConfigurationManager">
        <configuration default="false" name="No Settings" type="docker-deploy">
          <deployment type="dockerfile"/>
          <option value="ignored-without-name"/>
          <option name="imageTag" value="local/no-settings:dev"/>
          <option name="sourceFilePath" value="Dockerfile"/>
          <option name="description">
            Uses option text when the value attribute is blank.
          </option>
          <option name="buildArgs"><list/></option>
        </configuration>
      </component>
      """);

    IntelliJRunXmlParser.ParsedRunConfig cfg = IntelliJRunXmlParser.parse(xml);

    assertEquals("dockerfile", cfg.deploymentType());
    assertEquals("local/no-settings:dev", cfg.flatOptions().get("imageTag"));
    assertEquals(
        "Uses option text when the value attribute is blank.",
        cfg.flatOptions().get("description"));
    assertEquals(List.of(), cfg.buildArgs());
    assertEquals(
        "docker buildx build --load -t local/no-settings:dev -f Dockerfile .",
        IntelliJRunXmlParser.toDockerCommand(cfg, null));
  }

  @Test
  void dockerfileConversionHandlesExplicitContextNullBuildArgValueAndRequiredOptionFailures() {
    IntelliJRunXmlParser.ParsedRunConfig cfg = getParsedRunConfig();

    String command = IntelliJRunXmlParser.toDockerCommand(cfg, "/workspace");

    assertTrue(command.contains("--build-arg EMPTY="));
    assertTrue(command.endsWith("\"/workspace/context dir\""));
    assertFalse(command.contains("ignored"));

    IntelliJRunXmlParser.ParsedRunConfig missingTag =
        new IntelliJRunXmlParser.ParsedRunConfig(
            "Missing Tag",
            "docker-deploy",
            "dockerfile",
            Map.of("sourceFilePath", "Dockerfile"),
            List.of());
    IntelliJRunXmlParser.ParsedRunConfig missingDockerfile =
        new IntelliJRunXmlParser.ParsedRunConfig(
            "Missing Dockerfile",
            "docker-deploy",
            "dockerfile",
            Map.of("imageTag", "local/missing:dev"),
            List.of());

    assertThrows(
        IllegalArgumentException.class,
        () -> IntelliJRunXmlParser.toDockerCommand(missingTag, null));
    assertThrows(
        IllegalArgumentException.class,
        () -> IntelliJRunXmlParser.toDockerCommand(missingDockerfile, null));
  }

  private static IntelliJRunXmlParser.@NonNull ParsedRunConfig getParsedRunConfig() {
    Map<String, String> options = new HashMap<>();
    options.put("imageTag", "local/explicit:dev");
    options.put("sourceFilePath", "/workspace/Dockerfile");
    options.put("contextFolderPath", "/workspace/context dir");
    return new IntelliJRunXmlParser.ParsedRunConfig(
        "Explicit Context",
        "docker-deploy",
        "dockerfile",
        options,
        List.of(
            new IntelliJRunXmlParser.EnvVar("EMPTY", null),
            new IntelliJRunXmlParser.EnvVar(null, "ignored"),
            new IntelliJRunXmlParser.EnvVar(" ", "ignored")));
  }

  @Test
  void shellExtractionCoversBlankWorkspaceFallbackAndNoDockerCommandBranches() {
    IntelliJRunXmlParser.ParsedRunConfig shellWithBlankWorkspace =
        new IntelliJRunXmlParser.ParsedRunConfig(
            "Blank Workspace",
            "ShConfigurationType",
            null,
            Map.of("SCRIPT_TEXT", "docker compose --project-directory $PROJECT_DIR$/compose ps"),
            List.of());
    IntelliJRunXmlParser.ParsedRunConfig shellWithoutDocker =
        new IntelliJRunXmlParser.ParsedRunConfig(
            "No Docker",
            "ShConfigurationType",
            null,
            Map.of("SCRIPT_TEXT", "echo preparing\necho done"),
            List.of());
    IntelliJRunXmlParser.ParsedRunConfig fallbackProgramParameters =
        new IntelliJRunXmlParser.ParsedRunConfig(
            "Fallback", "unknown", null, Map.of("programParameters", "docker images"), List.of());

    assertEquals(
        "docker compose --project-directory $PROJECT_DIR$/compose ps",
        IntelliJRunXmlParser.toDockerCommand(shellWithBlankWorkspace, " "));
    assertNull(IntelliJRunXmlParser.toDockerCommand(shellWithoutDocker, "/workspace"));
    assertEquals(
        "docker images", IntelliJRunXmlParser.toDockerCommand(fallbackProgramParameters, null));
  }

  @Test
  void toDockerCommandFallsBackToExplicitDockerCommandAndReturnsNullForUnsupportedConfig() {
    IntelliJRunXmlParser.ParsedRunConfig explicit =
        new IntelliJRunXmlParser.ParsedRunConfig(
            "Explicit", "unknown", null, Map.of("commandLine", "  docker ps  "), List.of());
    IntelliJRunXmlParser.ParsedRunConfig unsupported =
        new IntelliJRunXmlParser.ParsedRunConfig(
            "Unsupported", "unknown", null, Map.of("commandLine", "echo hi"), List.of());

    assertEquals("docker ps", IntelliJRunXmlParser.toDockerCommand(explicit, "/workspace"));
    assertNull(IntelliJRunXmlParser.toDockerCommand(unsupported, "/workspace"));
    assertNull(IntelliJRunXmlParser.toDockerCommand(null, "/workspace"));
  }

  @Test
  void parseRejectsMissingConfigurationElement() throws Exception {
    Path xml = tempDir.resolve("invalid.run.xml");
    Files.writeString(xml, "<component><not-configuration/></component>");

    IllegalArgumentException ex =
        assertThrows(IllegalArgumentException.class, () -> IntelliJRunXmlParser.parse(xml));

    assertEquals("Missing <configuration> element", ex.getMessage());
  }
}
