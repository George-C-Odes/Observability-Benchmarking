package com.benchmarking.service;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for {@link CommandPolicy} focusing on compose rewriting.
 */
@QuarkusTest
public class CommandPolicyTest {

  @Inject
  CommandPolicy policy;

  @Test
  void compose_injects_file_under_workspace_projectDir() {
    var cmd = policy.validate("docker compose version");
    List<String> argv = cmd.argv();

    assertTrue(argv.size() >= 2);
    assertEquals("docker", argv.get(0));
    assertEquals("compose", argv.get(1));

    String expectedFile = java.nio.file.Path.of(cmd.projectDir()).resolve("docker-compose.yml").toString();
    assertContainsSubsequence(argv, List.of("-f", expectedFile));

    String expectedEnv = java.nio.file.Path.of(cmd.projectDir()).resolve(".env").toString();
    assertContainsSubsequence(argv, List.of("--env-file", expectedEnv));

    // project directory should be injected and should be container-visible
    assertContainsSubsequence(argv, List.of("--project-directory", cmd.projectDir()));
  }

  @Test
  void compose_allows_windows_style_file_path_when_user_provides_f() {
    var cmd = policy.validate("docker compose -f C:/Users/x/compose/docker-compose.yml version");
    List<String> argv = cmd.argv();

    assertContainsSubsequence(argv, List.of("-f", "C:/Users/x/compose/docker-compose.yml"));
  }

  @Test
  void compose_rejects_disallowed_global_options() {
    assertThrows(IllegalArgumentException.class, () -> policy.validate("docker compose --context foo version"));
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
