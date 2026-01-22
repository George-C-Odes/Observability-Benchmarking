package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.domain.CommandTokenizer;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Policy for validating docker commands.
 */
@ApplicationScoped
public class CommandPolicy {

  /**
   * Workspace directory.
   */
  @ConfigProperty(name = "orchestrator.project-paths.workspace.root")
  String workspace;

  /**
   * Project directory.
   */
  @ConfigProperty(name = "orchestrator.project-paths.workspace.compose")
  String projectDir;

  /**
   * Host-side project directory (used when orchestrator runs docker compose against a host Docker Engine).
   * When set, we inject this as --project-directory and treat it as trusted (not under /workspace).
   */
  @ConfigProperty(name = "orchestrator.project-paths.host-compose")
  java.util.Optional<String> hostProjectDir;

  /**
   * "Read-only-ish" docker commands (includes your requested docker ps).
   */
  private static final Set<String> ALLOWED_DOCKER_COMMANDS = Set.of(
    "ps", "version", "info", "images"
  );

  /**
   * docker compose subcommands allowed.
   */
  private static final Set<String> ALLOWED_COMPOSE_SUBCOMMANDS = Set.of(
    "up", "down", "ps", "logs", "pull", "build", "restart", "start", "stop", "top", "config", "version", "rm"
  );

  /**
   * docker buildx subcommands allowed.
   */
  private static final Set<String> ALLOWED_BUILDX_SUBCOMMANDS = Set.of(
    "build", "bake", "ls", "inspect", "create", "use", "rm", "stop", "version", "prune"
  );

  /**
   * Prevent redirecting the daemon target / messing with TLS daemon settings.
   */
  private static final Set<String> DISALLOWED_TOKENS = Set.of(
    "-H", "--host", "--context", "--config", "--tls", "--tlscacert", "--tlscert", "--tlskey", "--tlsverify"
  );

  /**
   * Compose global options (allowed before the subcommand) + whether they take a value.
   */
  private static final Map<String, Boolean> COMPOSE_GLOBAL_OPTS = Map.ofEntries(
    Map.entry("--project-directory", true),
    Map.entry("--profile", true),
    Map.entry("--file", true),
    Map.entry("-f", true),
    Map.entry("--env-file", true),
    Map.entry("--project-name", true),
    Map.entry("-p", true),
    Map.entry("--ansi", true),
    Map.entry("--parallel", true),
    Map.entry("--compatibility", false),
    Map.entry("--progress", true),

    Map.entry("--dummy", false) // will never be used; avoids empty Map.ofEntries issues if you edit later
  );

  public record ValidatedCommand(List<String> argv, String workspace, String projectDir) { }

  public ValidatedCommand validate(String raw) {
    List<String> t = CommandTokenizer.tokenize(raw);

    if (t.size() < 2) {
      throw new IllegalArgumentException("Command too short; expected 'docker <command> ...'");
    }
    if (!"docker".equals(t.get(0))) {
      throw new IllegalArgumentException("Only 'docker' commands are allowed");
    }

    // Basic safety checks (no shell operators, no daemon retargeting flags)
    for (String s : t) {
      if (DISALLOWED_TOKENS.contains(s)) {
        throw new IllegalArgumentException("Disallowed docker option: " + s);
      }
      if (s.contains(";") || s.contains("&&") || s.contains("|") || s.contains("`")) {
        throw new IllegalArgumentException("Disallowed token content");
      }
    }

    String cmd = t.get(1);

    if ("compose".equals(cmd)) {
      return validateCompose(t);
    }

    if ("buildx".equals(cmd)) {
      return validateBuildx(t);
    }

    if ("builder".equals(cmd)) {
      return validateBuilder(t);
    }

    if (!ALLOWED_DOCKER_COMMANDS.contains(cmd)) {
      throw new IllegalArgumentException("Docker command not allowed: " + cmd);
    }

    return new ValidatedCommand(t, workspace, projectDir);
  }

  /**
   * Supports: docker compose [GLOBAL_OPTIONS...] <subcommand> [args...]
   * where GLOBAL_OPTIONS can appear before the subcommand.
   * Fix B: supports both "--opt value" and "--opt=value" for global options.
   */
  private ValidatedCommand validateCompose(List<String> tokens) {
    if (tokens.size() < 3) {
      throw new IllegalArgumentException("Command too short; expected 'docker compose <subcommand> ...'");
    }

    int i = 2; // start after: docker compose
    boolean hasProjectDir = false;
    boolean hasFile = false;
    boolean hasEnvFile = false;

    // Consume compose global options (which come before the subcommand)
    while (i < tokens.size()) {
      String tok = tokens.get(i);

      // subcommand is first non-option token
      if (!tok.startsWith("-")) {
        break;
      }

      String opt = tok;
      String inlineVal = null;

      // Support --opt=value form (only for long options)
      int eq = tok.indexOf('=');
      if (eq > 0 && tok.startsWith("--")) {
        opt = tok.substring(0, eq);
        inlineVal = tok.substring(eq + 1);
        if (inlineVal.isEmpty()) {
          inlineVal = null;
        }
      }

      if (opt.equals("--dummy")) {
        i += 1;
        continue;
      }

      Boolean takesValue = COMPOSE_GLOBAL_OPTS.get(opt);
      if (takesValue == null) {
        throw new IllegalArgumentException("Compose global option not allowed: " + tok);
      }

      if (opt.equals("--project-directory")) {
        hasProjectDir = true;
      }
      if (opt.equals("--file") || opt.equals("-f")) {
        hasFile = true;
      }
      if (opt.equals("--env-file")) {
        hasEnvFile = true;
      }

      if (takesValue) {
        String val;

        if (inlineVal != null) {
          val = inlineVal;
          i += 1;
        } else {
          if (i + 1 >= tokens.size()) {
            throw new IllegalArgumentException("Missing value for option: " + opt);
          }
          val = tokens.get(i + 1);
          i += 2;
        }

        // validate path-like opts
        if (opt.equals("--project-directory") || opt.equals("--file") || opt.equals("-f") || opt.equals("--env-file")) {
          boolean isHostMode = hostProjectDir.isPresent();
          boolean isWindowsAbs = isWindowsAbsolutePath(val);
          if (!(isHostMode && (opt.equals("--project-directory") || opt.equals("--file") || opt.equals("-f")))) {
            if (!isWindowsAbs) {
              ensureUnderWorkspace(val);
            }
          }
        }

      } else {
        if (inlineVal != null) {
          throw new IllegalArgumentException("Option does not take a value: " + opt);
        }
        i += 1;
      }
    }

    if (i >= tokens.size()) {
      throw new IllegalArgumentException("Missing compose subcommand (e.g., up/down/ps/logs)");
    }

    String sub = tokens.get(i);
    if (!ALLOWED_COMPOSE_SUBCOMMANDS.contains(sub)) {
      throw new IllegalArgumentException("Compose subcommand not allowed: " + sub);
    }

    // Always force --project-directory to the container-visible projectDir.
    // This is required because:
    // - compose include paths (include: ./obs.yml, ./utils.yml) are resolved relative to project directory.
    // - when a Windows path is passed (C:/...), compose running in Linux treats it as relative and prefixes /workspace.
    // Using projectDir ensures includes and other relative references are readable inside the container.
    if (!hasProjectDir) {
      var tmp = new ArrayList<>(tokens);
      tmp.add(2, "--project-directory");
      tmp.add(3, projectDir);
      tokens = tmp;
    }

    // Ensure a compose file is provided (container-visible).
    if (!hasFile) {
      String file = Path.of(projectDir).resolve("docker-compose.yml").toString();
      var tmp = new ArrayList<>(tokens);
      tmp.add(2, "-f");
      tmp.add(3, file);
      tokens = tmp;
    }

    // Ensure the compose env file is loaded so variables from compose/.env (e.g. SPRING_BOOT_VERSION) are set,
    // regardless of the host process environment.
    if (!hasEnvFile) {
      String envFile = Path.of(projectDir).resolve(".env").toString();
      var tmp = new ArrayList<>(tokens);
      tmp.add(2, "--env-file");
      tmp.add(3, envFile);
      tokens = tmp;
    }

    return new ValidatedCommand(tokens, workspace, projectDir);
  }

  /**
   * Supports: docker buildx [options...] <subcommand> [args...]
   * We locate the first allowed subcommand token after "buildx".
   * Optional: validate -f/--file paths for buildx build.
   */
  private ValidatedCommand validateBuildx(List<String> tokens) {
    if (tokens.size() < 3) {
      throw new IllegalArgumentException("Command too short; expected 'docker buildx <subcommand> ...'");
    }

    int subIdx = -1;
    for (int i = 2; i < tokens.size(); i++) {
      if (ALLOWED_BUILDX_SUBCOMMANDS.contains(tokens.get(i))) {
        subIdx = i;
        break;
      }
    }

    if (subIdx == -1) {
      throw new IllegalArgumentException("Buildx subcommand not allowed or missing");
    }

    String sub = tokens.get(subIdx);

    if ("build".equals(sub)) {
      for (int i = subIdx + 1; i < tokens.size(); i++) {
        String tok = tokens.get(i);
        if (("-f".equals(tok) || "--file".equals(tok)) && i + 1 < tokens.size()) {
          ensureUnderWorkspace(tokens.get(i + 1));
          i++; // skip value
        }
      }
    }

    return new ValidatedCommand(tokens, workspace, projectDir);
  }

  /**
   * Supports: docker builder prune -a --force
   * This is intentionally narrow because prune is destructive.
   */
  private ValidatedCommand validateBuilder(List<String> tokens) {
    if (tokens.size() < 3) {
      throw new IllegalArgumentException("Command too short; expected 'docker builder <subcommand> ...'");
    }

    String sub = tokens.get(2);
    if (!"prune".equals(sub)) {
      throw new IllegalArgumentException("Builder subcommand not allowed: " + sub);
    }

    boolean hasAll = false;
    boolean hasForce = false;

    for (int i = 3; i < tokens.size(); i++) {
      String tok = tokens.get(i);
      if ("-a".equals(tok) || "--all".equals(tok)) {
        hasAll = true;
        continue;
      }
      if ("--force".equals(tok) || "-f".equals(tok)) {
        hasForce = true;
        continue;
      }

      // Keep this strict: no filters/labels/etc until explicitly requested.
      throw new IllegalArgumentException("Builder prune option not allowed: " + tok);
    }

    if (!hasAll) {
      throw new IllegalArgumentException("Builder prune requires -a/--all");
    }
    if (!hasForce) {
      throw new IllegalArgumentException("Builder prune requires --force");
    }

    return new ValidatedCommand(tokens, workspace, projectDir);
  }

  /**
   * Accepts absolute OR relative paths:
   * - absolute must be under workspace.
   * - relative is resolved against workspace.
   */
  private void ensureUnderWorkspace(String pathStr) {
    Path ws = Path.of(workspace).normalize().toAbsolutePath();
    Path p = Path.of(pathStr);
    Path abs = p.isAbsolute() ? p.normalize().toAbsolutePath() : ws.resolve(p).normalize().toAbsolutePath();

    if (!abs.startsWith(ws)) {
      throw new IllegalArgumentException("Path must be under workspace: " + abs);
    }
  }

  /**
   * Returns true if the provided path string looks like an absolute Windows path.
   * This is needed because the orchestrator runs on Linux inside a container, where Path.of("C:/x")
   * is treated as relative (and would otherwise be resolved under /workspace).
   */
  private static boolean isWindowsAbsolutePath(String path) {
    if (path == null || path.isBlank()) {
      return false;
    }
    // C:\... or C:/...
    if (path.length() >= 3
      && Character.isLetter(path.charAt(0))
      && path.charAt(1) == ':'
      && (path.charAt(2) == '\\' || path.charAt(2) == '/')) {
      return true;
    }
    // UNC paths: \\server\share\...
    return path.startsWith("\\\\") || path.startsWith("//");
  }
}
