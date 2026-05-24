package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.application.CommandPolicy.ValidatedCommand;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;

/** Validates intentionally narrow {@code docker builder} commands. */
@ApplicationScoped
public final class BuilderCommandValidator implements CommandGroupValidator {

  /** Docker builder command group. */
  private static final String BUILDER_COMMAND = "builder";

  /** Minimum token count for {@code docker builder <subcommand>}. */
  private static final int MIN_BUILDER_TOKENS = 3;

  /** Index of the builder subcommand token. */
  private static final int BUILDER_SUBCOMMAND_INDEX = 2;

  /** First option index for {@code docker builder prune}. */
  private static final int BUILDER_PRUNE_OPTION_START_INDEX = 3;

  /** Docker builder prune subcommand. */
  private static final String PRUNE_SUBCOMMAND = "prune";

  /** Builder force option. */
  private static final String FORCE_OPTION = "--force";

  /** Builder short force option. */
  private static final String SHORT_FORCE_OPTION = "-f";

  /** Builder all option. */
  private static final String ALL_OPTION = "--all";

  /** Builder short all option. */
  private static final String SHORT_ALL_OPTION = "-a";

  /** Strongly typed project-path configuration. */
  private final ProjectPathsConfig paths;

  /**
   * Creates a builder command validator.
   *
   * @param paths strongly typed project-path configuration
   */
  @Inject
  public BuilderCommandValidator(ProjectPathsConfig paths) {
    this.paths = paths;
  }

  /**
   * Returns the Docker command group handled by this validator.
   *
   * @return {@code builder}
   */
  @Override
  public String commandGroup() {
    return BUILDER_COMMAND;
  }

  /**
   * Validates a {@code docker builder} command.
   *
   * @param tokens the tokenized docker builder command
   * @return the validated command
   */
  @Override
  public ValidatedCommand validate(List<String> tokens) {
    requireMinimumTokens(tokens);
    requirePruneSubcommand(tokens);
    parsePruneOptions(tokens).requireComplete();
    return new ValidatedCommand(tokens, paths.workspace().root(), paths.workspace().compose());
  }

  /**
   * Ensures the token list can contain a builder subcommand.
   *
   * @param tokens the tokenized command
   */
  private static void requireMinimumTokens(List<String> tokens) {
    if (tokens.size() < MIN_BUILDER_TOKENS) {
      throw new IllegalArgumentException(
          "Command too short; expected 'docker builder <subcommand> ...'");
    }
  }

  /**
   * Ensures the builder subcommand is the narrowly allowed prune command.
   *
   * @param tokens the tokenized command
   */
  private static void requirePruneSubcommand(List<String> tokens) {
    String subcommand = tokens.get(BUILDER_SUBCOMMAND_INDEX);
    if (!PRUNE_SUBCOMMAND.equals(subcommand)) {
      throw new IllegalArgumentException("Builder subcommand not allowed: " + subcommand);
    }
  }

  /**
   * Parses allowed builder-prune options.
   *
   * @param tokens the tokenized command
   * @return parsed option state
   */
  private static BuilderPruneOptions parsePruneOptions(List<String> tokens) {
    BuilderPruneOptions options = new BuilderPruneOptions();
    for (int index = BUILDER_PRUNE_OPTION_START_INDEX; index < tokens.size(); index++) {
      options.mark(tokens.get(index));
    }
    return options;
  }

  /** Mutable option state for the intentionally narrow builder-prune command. */
  private static final class BuilderPruneOptions {

    /** Whether {@code -a} or {@code --all} was supplied. */
    private boolean hasAll;

    /** Whether {@code -f} or {@code --force} was supplied. */
    private boolean hasForce;

    /**
     * Marks a builder-prune option as supplied.
     *
     * @param option the option token
     */
    private void mark(String option) {
      if (SHORT_ALL_OPTION.equals(option) || ALL_OPTION.equals(option)) {
        hasAll = true;
        return;
      }
      if (FORCE_OPTION.equals(option) || SHORT_FORCE_OPTION.equals(option)) {
        hasForce = true;
        return;
      }
      throw new IllegalArgumentException("Builder prune option not allowed: " + option);
    }

    /** Ensures all required prune options were supplied. */
    private void requireComplete() {
      if (!hasAll) {
        throw new IllegalArgumentException("Builder prune requires -a/--all");
      }
      if (!hasForce) {
        throw new IllegalArgumentException("Builder prune requires --force");
      }
    }
  }
}
