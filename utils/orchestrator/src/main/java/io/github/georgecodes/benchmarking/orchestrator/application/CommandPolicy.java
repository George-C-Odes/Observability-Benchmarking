package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.domain.CommandTokenizer;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Set;

/** Policy for validating docker commands. */
@ApplicationScoped
public class CommandPolicy {

  /** Strongly typed project-path configuration. */
  private final ProjectPathsConfig paths;

  /** Registry of supported Docker command-group validators. */
  private final CommandGroupValidatorRegistry commandGroupValidators;

  /**
   * Creates a command policy using configured project paths.
   *
   * @param paths strongly typed project-path configuration
   * @param commandGroupValidators registry of CDI-provided command-group validators
   */
  @Inject
  public CommandPolicy(
      ProjectPathsConfig paths, CommandGroupValidatorRegistry commandGroupValidators) {
    this.paths = paths;
    this.commandGroupValidators = commandGroupValidators;
  }

  /** Minimum token count for {@code docker <command>}. */
  private static final int MIN_DOCKER_TOKENS = 2;

  /** Index of the Docker executable token. */
  private static final int DOCKER_EXECUTABLE_INDEX = 0;

  /** Index of the Docker command-group token. */
  private static final int DOCKER_COMMAND_INDEX = 1;

  /** Docker CLI executable expected as the first token. */
  private static final String DOCKER_COMMAND = "docker";

  /** Shell command separator token rejected by the policy. */
  private static final String SHELL_SEQUENCE_SEPARATOR = ";";

  /** Shell logical-and token rejected by the policy. */
  private static final String SHELL_AND_OPERATOR = "&&";

  /** Shell pipe token rejected by the policy. */
  private static final String SHELL_PIPE_OPERATOR = "|";

  /** Shell command-substitution token rejected by the policy. */
  private static final String SHELL_COMMAND_SUBSTITUTION = "`";

  /** "Read-only-ish" docker commands (includes your requested docker ps). */
  private static final Set<String> ALLOWED_DOCKER_COMMANDS =
      Set.of("ps", "version", "info", "images");

  /** Prevent redirecting the daemon target / messing with TLS daemon settings. */
  private static final Set<String> DISALLOWED_TOKENS =
      Set.of(
          "-H",
          "--host",
          "--context",
          "--config",
          "--tls",
          "--tlscacert",
          "--tlscert",
          "--tlskey",
          "--tlsverify");

  /**
   * Validated command metadata ready for execution.
   *
   * @param argv the tokenized command arguments
   * @param workspace the workspace directory used as the process working directory
   * @param projectDir the compose project directory associated with the command
   */
  public record ValidatedCommand(List<String> argv, String workspace, String projectDir) {

    /**
     * Creates validated command metadata with an immutable argument list.
     *
     * @param argv the tokenized command arguments
     * @param workspace the workspace directory used as the process working directory
     * @param projectDir the compose project directory associated with the command
     */
    public ValidatedCommand {
      argv = List.copyOf(argv);
    }
  }

  /**
   * Validates a raw docker command string and converts it into an executable command model.
   *
   * @param raw the raw command string from the client
   * @return the validated command metadata
   * @throws IllegalArgumentException when the command is disallowed or malformed
   */
  public ValidatedCommand validate(String raw) {
    List<String> tokens = CommandTokenizer.tokenize(raw);
    requireDockerCommand(tokens);
    validateSafeTokens(tokens);
    return validateCommandGroup(tokens);
  }

  /**
   * Ensures the command starts with {@code docker} and contains a command group.
   *
   * @param tokens the tokenized command
   */
  private static void requireDockerCommand(List<String> tokens) {
    if (tokens.size() < MIN_DOCKER_TOKENS) {
      throw new IllegalArgumentException("Command too short; expected 'docker <command> ...'");
    }
    if (!DOCKER_COMMAND.equals(tokens.get(DOCKER_EXECUTABLE_INDEX))) {
      throw new IllegalArgumentException("Only 'docker' commands are allowed");
    }
  }

  /**
   * Applies baseline safety checks common to all accepted Docker commands.
   *
   * @param tokens the tokenized command
   */
  private static void validateSafeTokens(List<String> tokens) {
    for (String token : tokens) {
      validateSafeToken(token);
    }
  }

  /**
   * Applies baseline safety checks to one token.
   *
   * @param token the token to inspect
   */
  private static void validateSafeToken(String token) {
    if (DISALLOWED_TOKENS.contains(token)) {
      throw new IllegalArgumentException("Disallowed docker option: " + token);
    }
    if (containsShellOperator(token)) {
      throw new IllegalArgumentException("Disallowed token content");
    }
  }

  /**
   * Dispatches to the validator for the requested Docker command group.
   *
   * @param tokens the tokenized command
   * @return the validated command metadata
   */
  private ValidatedCommand validateCommandGroup(List<String> tokens) {
    String command = tokens.get(DOCKER_COMMAND_INDEX);
    return commandGroupValidators
        .find(command)
        .map(validator -> validator.validate(tokens))
        .orElseGet(() -> validateDockerCommand(tokens, command));
  }

  /**
   * Validates a simple top-level Docker command.
   *
   * @param tokens the tokenized command
   * @param command the top-level Docker command
   * @return the validated command metadata
   */
  private ValidatedCommand validateDockerCommand(List<String> tokens, String command) {
    if (!ALLOWED_DOCKER_COMMANDS.contains(command)) {
      throw new IllegalArgumentException("Docker command not allowed: " + command);
    }
    return new ValidatedCommand(tokens, paths.workspace().root(), paths.workspace().compose());
  }

  /**
   * Checks whether a token contains shell operators rejected by this policy.
   *
   * @param token the token to inspect
   * @return {@code true} when the token contains a disallowed shell operator
   */
  private static boolean containsShellOperator(String token) {
    return token.contains(SHELL_SEQUENCE_SEPARATOR)
        || token.contains(SHELL_AND_OPERATOR)
        || token.contains(SHELL_PIPE_OPERATOR)
        || token.contains(SHELL_COMMAND_SUBSTITUTION);
  }
}
