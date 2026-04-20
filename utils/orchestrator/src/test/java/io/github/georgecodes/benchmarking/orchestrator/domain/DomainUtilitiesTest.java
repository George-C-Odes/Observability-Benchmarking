package io.github.georgecodes.benchmarking.orchestrator.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DomainUtilitiesTest {

  @TempDir
  Path tempDir;

  @Test
  void commandTokenizerHandlesNullQuotesEscapesAndWhitespace() {
    assertEquals(List.of(), CommandTokenizer.tokenize(null));
    assertEquals(List.of("docker", "ps"), CommandTokenizer.tokenize("  docker   ps  "));

    List<String> tokens = CommandTokenizer.tokenize(
      "docker compose --profile=OBS up -d \"service name\" 'quoted value' \"a\\\"b\""
    );

    assertEquals(List.of(
      "docker",
      "compose",
      "--profile=OBS",
      "up",
      "-d",
      "service name",
      "quoted value",
      "a\"b"
    ), tokens);
  }

  @Test
  void commandTokenizerLeavesBackslashesOutsideQuotesUntouched() {
    assertEquals(
      List.of("docker", "compose", "-f", "C:\\repo\\docker-compose.yml", "version"),
      CommandTokenizer.tokenize("docker compose -f C:\\repo\\docker-compose.yml version")
    );
  }

  @Test
  void parseShellRunConfigAndExtractFirstDockerCommand() throws Exception {
    Path xml = tempDir.resolve("shell.run.xml");
    Files.writeString(xml, """
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
    Files.writeString(xml, """
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
    assertEquals(new IntelliJRunXmlParser.EnvVar("GREETING", "hello world"), cfg.buildArgs().get(1));

    String command = IntelliJRunXmlParser.toDockerCommand(cfg, "/workspace");
    String expectedContext = Path.of("/workspace/service dir/Dockerfile").getParent().toString();

    assertTrue(command.startsWith("docker buildx build --load -t local/sample:dev -f \"/workspace/service dir/Dockerfile\""));
    assertTrue(command.contains("--build-arg HTTP_PORT=8080"));
    assertTrue(command.contains("--build-arg \"GREETING=hello world\""));
    assertTrue(command.endsWith("\"" + expectedContext + "\""));
  }

  @Test
  void toDockerCommandFallsBackToExplicitDockerCommandAndReturnsNullForUnsupportedConfig() {
    IntelliJRunXmlParser.ParsedRunConfig explicit = new IntelliJRunXmlParser.ParsedRunConfig(
      "Explicit",
      "unknown",
      null,
      Map.of("commandLine", "  docker ps  "),
      List.of()
    );
    IntelliJRunXmlParser.ParsedRunConfig unsupported = new IntelliJRunXmlParser.ParsedRunConfig(
      "Unsupported",
      "unknown",
      null,
      Map.of("commandLine", "echo hi"),
      List.of()
    );

    assertEquals("docker ps", IntelliJRunXmlParser.toDockerCommand(explicit, "/workspace"));
    assertNull(IntelliJRunXmlParser.toDockerCommand(unsupported, "/workspace"));
    assertNull(IntelliJRunXmlParser.toDockerCommand(null, "/workspace"));
  }

  @Test
  void parseRejectsMissingConfigurationElement() throws Exception {
    Path xml = tempDir.resolve("invalid.run.xml");
    Files.writeString(xml, "<component><not-configuration/></component>");

    IllegalArgumentException ex = assertThrows(
      IllegalArgumentException.class,
      () -> IntelliJRunXmlParser.parse(xml)
    );

    assertEquals("Missing <configuration> element", ex.getMessage());
  }
}

