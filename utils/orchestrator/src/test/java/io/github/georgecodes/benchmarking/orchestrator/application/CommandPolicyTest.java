package io.github.georgecodes.benchmarking.orchestrator.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Unit tests for {@link CommandPolicy} focusing on compose rewriting. */
@QuarkusTest
class CommandPolicyTest {

  @Inject CommandPolicy policy;

  @Test
  void testComposeInjectsFileUnderWorkspaceProjectDir() {
    var cmd = policy.validate("docker compose version");
    List<String> argv = cmd.argv();

    assertTrue(
        argv.size() >= 2, "Validated command should contain the Docker executable and subcommand");
    assertEquals("docker", argv.get(0), "Validated command should use the Docker executable");
    assertEquals("compose", argv.get(1), "Validated command should use the Compose subcommand");

    Path path = Path.of(cmd.projectDir());
    String expectedFile = path.resolve("docker-compose.yml").toString();
    assertContainsSubsequence(argv, List.of("-f", expectedFile));

    String expectedEnv = path.resolve(".env").toString();
    assertContainsSubsequence(argv, List.of("--env-file", expectedEnv));

    // project directory should be injected and should be container-visible
    assertContainsSubsequence(argv, List.of("--project-directory", cmd.projectDir()));
  }

  @Test
  void testComposeAllowsWindowsStyleFilePathWhenUserProvidesF() {
    var cmd = policy.validate("docker compose -f C:/Users/x/compose/docker-compose.yml version");
    List<String> argv = cmd.argv();

    assertContainsSubsequence(argv, List.of("-f", "C:/Users/x/compose/docker-compose.yml"));
  }

  @Test
  void testComposeRejectsDisallowedGlobalOptions() {
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker compose --context foo version"),
        "Compose should reject the disallowed --context option");
  }

  @Test
  void testValidateRejectsShortNonDockerAndShellLikeCommands() {
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker"),
        "Docker commands should require a subcommand");
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("podman ps"),
        "Only Docker commands should be allowed");
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker ps && whoami"),
        "Shell command chaining should be rejected");
  }

  @Test
  void testComposeAllowsEqualsFormAndRejectsMissingValuesOrUnknownSubcommands() {
    var cmd = policy.validate("docker compose --profile=OBS version");

    assertContainsSubsequence(cmd.argv(), List.of("--profile=OBS", "version"));

    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker compose --project-name"),
        "Compose options that require values should reject missing values");
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker compose exec sh"),
        "Compose should reject subcommands outside the allowlist");
  }

  @Test
  void testBuildxAcceptsWorkspaceRelativeFileAndRejectsMissingOrUnknownSubcommands() {
    var cmd = policy.validate("docker buildx build -f compose/docker-compose.yml .");

    assertEquals(
        List.of("docker", "buildx", "build", "-f", "compose/docker-compose.yml", "."),
        cmd.argv(),
        "Buildx should preserve the workspace-relative file and build context");

    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker buildx"),
        "Buildx should require a subcommand");
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker buildx imaginary"),
        "Buildx should reject unknown subcommands");
  }

  @Test
  void testAllowsDockerBuildxPruneForceAll() {
    var cmd = policy.validate("docker buildx prune -a --force");
    assertEquals(
        List.of("docker", "buildx", "prune", "-a", "--force"),
        cmd.argv(),
        "Buildx prune should preserve the allowed all and force options");
  }

  @Test
  void testAllowsDockerBuilderPruneForceAll() {
    var cmd = policy.validate("docker builder prune -a --force");
    assertEquals(
        List.of("docker", "builder", "prune", "-a", "--force"),
        cmd.argv(),
        "Builder prune should preserve the allowed all and force options");
  }

  @Test
  void testBuilderPruneRequiresForce() {
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker builder prune -a"),
        "Builder prune should require explicit force confirmation");
  }

  @Test
  void testBuilderPruneRejectsExtraOptions() {
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker builder prune -a --force --filter foo"),
        "Builder prune should reject options outside the allowlist");
  }

  @Test
  void testBuilderPruneRequiresPruneSubcommandAndReadonlyDockerCommandsAreAllowed() {
    assertThrows(
        IllegalArgumentException.class,
        () -> policy.validate("docker builder ls"),
        "Builder should reject subcommands other than prune");
    assertEquals(
        List.of("docker", "info"),
        policy.validate("docker info").argv(),
        "Read-only Docker commands should be allowed without rewriting");
  }

  private static void assertContainsSubsequence(List<String> haystack, List<String> needle) {
    assertFalse(needle.isEmpty(), "Expected command subsequence should not be empty");

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
