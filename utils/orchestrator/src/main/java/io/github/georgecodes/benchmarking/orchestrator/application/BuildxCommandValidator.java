package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.application.CommandPolicy.ValidatedCommand;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.OptionalInt;
import java.util.Set;

/** Validates {@code docker buildx} commands accepted by the orchestrator. */
@ApplicationScoped
public final class BuildxCommandValidator implements CommandGroupValidator {

  /** Docker Buildx command group. */
  private static final String BUILDX_COMMAND = "buildx";

  /** Minimum token count for {@code docker buildx <subcommand>}. */
  private static final int MIN_BUILDX_TOKENS = 3;

  /** Index where buildx subcommand/options begin. */
  private static final int BUILDX_TOKEN_START_INDEX = 2;

  /** Docker buildx build subcommand. */
  private static final String BUILD_SUBCOMMAND = "build";

  /** Docker builder prune subcommand. */
  private static final String PRUNE_SUBCOMMAND = "prune";

  /** Long file option. */
  private static final String FILE_OPTION = "--file";

  /** Short file option. */
  private static final String SHORT_FILE_OPTION = "-f";

  /** docker buildx subcommands allowed. */
  private static final Set<String> ALLOWED_BUILDX_SUBCOMMANDS =
      Set.of(
          BUILD_SUBCOMMAND,
          "bake",
          "ls",
          "inspect",
          "create",
          "use",
          "rm",
          "stop",
          "version",
          PRUNE_SUBCOMMAND);

  /** Strongly typed project-path configuration. */
  private final ProjectPathsConfig paths;

  /** Workspace path validator. */
  private final WorkspacePathValidator pathValidator;

  /**
   * Creates a buildx command validator.
   *
   * @param paths strongly typed project-path configuration
   */
  @Inject
  public BuildxCommandValidator(ProjectPathsConfig paths) {
    this.paths = paths;
    this.pathValidator = new WorkspacePathValidator(paths);
  }

  /**
   * Returns the Docker command group handled by this validator.
   *
   * @return {@code buildx}
   */
  @Override
  public String commandGroup() {
    return BUILDX_COMMAND;
  }

  /**
   * Validates a {@code docker buildx} command.
   *
   * @param tokens the tokenized docker buildx command
   * @return the validated command
   */
  @Override
  public ValidatedCommand validate(List<String> tokens) {
    requireMinimumTokens(tokens);

    int subcommandIndex =
        findAllowedSubcommand(tokens)
            .orElseThrow(
                () -> new IllegalArgumentException("Buildx subcommand not allowed or missing"));
    String subcommand = tokens.get(subcommandIndex);

    if (BUILD_SUBCOMMAND.equals(subcommand)) {
      validateBuildOptions(tokens, subcommandIndex + 1);
    }

    return new ValidatedCommand(tokens, paths.workspace().root(), paths.workspace().compose());
  }

  /**
   * Ensures the token list can contain a buildx subcommand.
   *
   * @param tokens the tokenized command
   */
  private static void requireMinimumTokens(List<String> tokens) {
    if (tokens.size() < MIN_BUILDX_TOKENS) {
      throw new IllegalArgumentException(
          "Command too short; expected 'docker buildx <subcommand> ...'");
    }
  }

  /**
   * Finds the first allowed buildx subcommand.
   *
   * @param tokens the tokenized command
   * @return the allowed subcommand index, when present
   */
  private static OptionalInt findAllowedSubcommand(List<String> tokens) {
    for (int index = BUILDX_TOKEN_START_INDEX; index < tokens.size(); index++) {
      if (ALLOWED_BUILDX_SUBCOMMANDS.contains(tokens.get(index))) {
        return OptionalInt.of(index);
      }
    }
    return OptionalInt.empty();
  }

  /**
   * Validates file-related options for {@code docker buildx build}.
   *
   * @param tokens the tokenized command
   * @param startIndex the first option index after the build subcommand
   */
  private void validateBuildOptions(List<String> tokens, int startIndex) {
    int index = startIndex;
    while (index < tokens.size()) {
      index += validateBuildOption(tokens, index);
    }
  }

  /**
   * Validates one {@code docker buildx build} option/value pair when relevant.
   *
   * @param tokens the tokenized command
   * @param index the option index to inspect
   * @return the number of tokens consumed
   */
  private int validateBuildOption(List<String> tokens, int index) {
    String token = tokens.get(index);
    if ((SHORT_FILE_OPTION.equals(token) || FILE_OPTION.equals(token))
        && index + 1 < tokens.size()) {
      pathValidator.ensureUnderWorkspace(tokens.get(index + 1));
      return 2;
    }
    return 1;
  }
}
