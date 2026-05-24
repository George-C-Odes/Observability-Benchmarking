package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.application.CommandPolicy.ValidatedCommand;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Validates {@code docker compose} commands and applies orchestrator compose defaults. */
@ApplicationScoped
public final class ComposeCommandValidator implements CommandGroupValidator {

  /** Docker Compose command group. */
  private static final String COMPOSE_COMMAND = "compose";

  /** Minimum token count for {@code docker compose <subcommand>}. */
  private static final int MIN_COMPOSE_TOKENS = 3;

  /** Index where Compose global options start. */
  private static final int COMPOSE_OPTION_START_INDEX = 2;

  /** Insertion index for default Compose options. */
  private static final int DEFAULT_OPTION_INSERT_INDEX = 2;

  /** Insertion index for default Compose option values. */
  private static final int DEFAULT_OPTION_VALUE_INSERT_INDEX = 3;

  /** Prefix for command-line options. */
  private static final String OPTION_PREFIX = "-";

  /** Prefix for long command-line options. */
  private static final String LONG_OPTION_PREFIX = "--";

  /** Separator used by inline option values. */
  private static final char OPTION_VALUE_SEPARATOR = '=';

  /** Compose project-directory option. */
  private static final String PROJECT_DIRECTORY_OPTION = "--project-directory";

  /** Compose long file option. */
  private static final String FILE_OPTION = "--file";

  /** Compose short file option. */
  private static final String SHORT_FILE_OPTION = "-f";

  /** Compose env-file option. */
  private static final String ENV_FILE_OPTION = "--env-file";

  /** Compose build subcommand. */
  private static final String BUILD_SUBCOMMAND = "build";

  /** docker compose subcommands allowed. */
  private static final Set<String> ALLOWED_COMPOSE_SUBCOMMANDS =
      Set.of(
          "up",
          "down",
          "ps",
          "logs",
          "pull",
          BUILD_SUBCOMMAND,
          "restart",
          "start",
          "stop",
          "top",
          "config",
          "version",
          "rm");

  /** Compose global options (allowed before the subcommand) + whether they take a value. */
  private static final Map<String, Boolean> COMPOSE_GLOBAL_OPTS =
      Map.ofEntries(
          Map.entry(PROJECT_DIRECTORY_OPTION, true),
          Map.entry("--profile", true),
          Map.entry(FILE_OPTION, true),
          Map.entry(SHORT_FILE_OPTION, true),
          Map.entry(ENV_FILE_OPTION, true),
          Map.entry("--project-name", true),
          Map.entry("-p", true),
          Map.entry("--ansi", true),
          Map.entry("--parallel", true),
          Map.entry("--compatibility", false),
          Map.entry("--progress", true));

  /** Strongly typed project-path configuration. */
  private final ProjectPathsConfig paths;

  /** Workspace path validator. */
  private final WorkspacePathValidator pathValidator;

  /**
   * Creates a Compose command validator.
   *
   * @param paths strongly typed project-path configuration
   */
  @Inject
  public ComposeCommandValidator(ProjectPathsConfig paths) {
    this.paths = paths;
    this.pathValidator = new WorkspacePathValidator(paths);
  }

  /**
   * Returns the Docker command group handled by this validator.
   *
   * @return {@code compose}
   */
  @Override
  public String commandGroup() {
    return COMPOSE_COMMAND;
  }

  /**
   * Validates a {@code docker compose} command and applies default compose path options when
   * absent.
   *
   * @param tokens the tokenized docker compose command
   * @return the validated command with normalized compose defaults applied
   */
  @Override
  public ValidatedCommand validate(List<String> tokens) {
    requireMinimumTokens(tokens);

    ComposeGlobalState globalState = new ComposeGlobalState();
    int subcommandIndex = consumeComposeGlobalOptions(tokens, globalState);
    requireSubcommand(tokens, subcommandIndex);

    List<String> argv = new ArrayList<>(tokens);
    String composeDir = paths.workspace().compose();
    Path composePath = Path.of(composeDir);

    addDefaultProjectDirectory(argv, globalState, composeDir);
    addDefaultComposeFile(argv, globalState, composePath);
    addDefaultEnvFile(argv, globalState, composePath);

    return new ValidatedCommand(argv, paths.workspace().root(), composeDir);
  }

  /**
   * Ensures the token list can contain a Compose subcommand.
   *
   * @param tokens the tokenized command
   */
  private static void requireMinimumTokens(List<String> tokens) {
    if (tokens.size() < MIN_COMPOSE_TOKENS) {
      throw new IllegalArgumentException(
          "Command too short; expected 'docker compose <subcommand> ...'");
    }
  }

  /**
   * Ensures the resolved Compose subcommand is present and allowed.
   *
   * @param tokens the tokenized command
   * @param subcommandIndex the resolved subcommand index
   */
  private static void requireSubcommand(List<String> tokens, int subcommandIndex) {
    if (subcommandIndex >= tokens.size()) {
      throw new IllegalArgumentException("Missing compose subcommand (e.g., up/down/ps/logs)");
    }

    String subcommand = tokens.get(subcommandIndex);
    if (!ALLOWED_COMPOSE_SUBCOMMANDS.contains(subcommand)) {
      throw new IllegalArgumentException("Compose subcommand not allowed: " + subcommand);
    }
  }

  /**
   * Adds a default project directory when the caller omitted one.
   *
   * @param argv mutable command arguments
   * @param globalState parsed global option state
   * @param composeDir container-visible compose directory
   */
  private static void addDefaultProjectDirectory(
      List<String> argv, ComposeGlobalState globalState, String composeDir) {
    if (!globalState.hasProjectDir) {
      argv.add(DEFAULT_OPTION_INSERT_INDEX, PROJECT_DIRECTORY_OPTION);
      argv.add(DEFAULT_OPTION_VALUE_INSERT_INDEX, composeDir);
    }
  }

  /**
   * Adds a default compose file when the caller omitted one.
   *
   * @param argv mutable command arguments
   * @param globalState parsed global option state
   * @param composePath container-visible compose directory path
   */
  private static void addDefaultComposeFile(
      List<String> argv, ComposeGlobalState globalState, Path composePath) {
    if (!globalState.hasFile) {
      String file = composePath.resolve("docker-compose.yml").toString();
      argv.add(DEFAULT_OPTION_INSERT_INDEX, SHORT_FILE_OPTION);
      argv.add(DEFAULT_OPTION_VALUE_INSERT_INDEX, file);
    }
  }

  /**
   * Adds a default compose env file when the caller omitted one.
   *
   * @param argv mutable command arguments
   * @param globalState parsed global option state
   * @param composePath container-visible compose directory path
   */
  private static void addDefaultEnvFile(
      List<String> argv, ComposeGlobalState globalState, Path composePath) {
    if (!globalState.hasEnvFile) {
      String envFile = composePath.resolve(".env").toString();
      argv.add(DEFAULT_OPTION_INSERT_INDEX, ENV_FILE_OPTION);
      argv.add(DEFAULT_OPTION_VALUE_INSERT_INDEX, envFile);
    }
  }

  /**
   * Consumes Docker Compose global options from the token stream.
   *
   * @param tokens the full token stream
   * @param globalState mutable state tracking caller-provided options
   * @return the index of the compose subcommand
   */
  private int consumeComposeGlobalOptions(List<String> tokens, ComposeGlobalState globalState) {
    int index = COMPOSE_OPTION_START_INDEX;
    while (index < tokens.size() && tokens.get(index).startsWith(OPTION_PREFIX)) {
      index = consumeComposeGlobalOption(tokens, index, globalState);
    }
    return index;
  }

  /**
   * Consumes one Docker Compose global option.
   *
   * @param tokens the full token stream
   * @param optionIndex the index of the option token to consume
   * @param globalState mutable state tracking caller-provided options
   * @return the next unconsumed token index
   */
  private int consumeComposeGlobalOption(
      List<String> tokens, int optionIndex, ComposeGlobalState globalState) {
    String token = tokens.get(optionIndex);
    ParsedComposeOption option = parseComposeOption(token);
    Boolean takesValue = COMPOSE_GLOBAL_OPTS.get(option.name());
    if (takesValue == null) {
      throw new IllegalArgumentException("Compose global option not allowed: " + token);
    }

    globalState.mark(option.name());
    if (takesValue) {
      ComposeOptionValue optionValue = readComposeOptionValue(tokens, optionIndex, option);
      validateComposePathOption(option.name(), optionValue.value());
      return optionValue.nextIndex();
    }

    if (option.inlineValue().isPresent()) {
      throw new IllegalArgumentException("Option does not take a value: " + option.name());
    }
    return optionIndex + 1;
  }

  /**
   * Parses a Compose option, including optional {@code --option=value} syntax.
   *
   * @param token the option token to parse
   * @return the parsed option name and inline value
   */
  private static ParsedComposeOption parseComposeOption(String token) {
    int separator = token.indexOf(OPTION_VALUE_SEPARATOR);
    if (separator > 0 && token.startsWith(LONG_OPTION_PREFIX)) {
      String value = token.substring(separator + 1);
      Optional<String> inlineValue = value.isEmpty() ? Optional.empty() : Optional.of(value);
      return new ParsedComposeOption(token.substring(0, separator), inlineValue);
    }
    return new ParsedComposeOption(token, Optional.empty());
  }

  /**
   * Reads a Compose option value from inline syntax or the following token.
   *
   * @param tokens the full token stream
   * @param optionIndex the index of the option token
   * @param option the parsed option metadata
   * @return the consumed option value and next token index
   */
  private static ComposeOptionValue readComposeOptionValue(
      List<String> tokens, int optionIndex, ParsedComposeOption option) {
    if (option.inlineValue().isPresent()) {
      return new ComposeOptionValue(optionIndex + 1, option.inlineValue().orElseThrow());
    }
    if (optionIndex + 1 >= tokens.size()) {
      throw new IllegalArgumentException("Missing value for option: " + option.name());
    }
    return new ComposeOptionValue(optionIndex + 2, tokens.get(optionIndex + 1));
  }

  /**
   * Validates path-like Compose option values when they must be container-visible workspace paths.
   *
   * @param option the Compose option name
   * @param value the option value
   */
  private void validateComposePathOption(String option, String value) {
    if (!isPathLikeComposeOption(option) || WorkspacePathValidator.isWindowsAbsolutePath(value)) {
      return;
    }
    if (paths.hostCompose().isPresent() && isHostComposePathOption(option)) {
      return;
    }
    pathValidator.ensureUnderWorkspace(value);
  }

  /**
   * Checks whether a Compose option contains a path value.
   *
   * @param option the Compose option name
   * @return {@code true} for path-like options
   */
  private static boolean isPathLikeComposeOption(String option) {
    return PROJECT_DIRECTORY_OPTION.equals(option)
        || FILE_OPTION.equals(option)
        || SHORT_FILE_OPTION.equals(option)
        || ENV_FILE_OPTION.equals(option);
  }

  /**
   * Checks whether a Compose path option may refer to a host path in host-compose mode.
   *
   * @param option the Compose option name
   * @return {@code true} when host-compose mode allows the option to be a host path
   */
  private static boolean isHostComposePathOption(String option) {
    return PROJECT_DIRECTORY_OPTION.equals(option)
        || FILE_OPTION.equals(option)
        || SHORT_FILE_OPTION.equals(option);
  }

  /** Parsed Compose option metadata. */
  private record ParsedComposeOption(String name, Optional<String> inlineValue) {}

  /** Compose option value and the next token index after consuming it. */
  private record ComposeOptionValue(int nextIndex, String value) {}

  /** Mutable tracking for Compose global options explicitly supplied by the caller. */
  private static final class ComposeGlobalState {

    /** Whether {@code --project-directory} was supplied. */
    private boolean hasProjectDir;

    /** Whether {@code --file} or {@code -f} was supplied. */
    private boolean hasFile;

    /** Whether {@code --env-file} was supplied. */
    private boolean hasEnvFile;

    /**
     * Marks an option as supplied.
     *
     * @param option the option name
     */
    private void mark(String option) {
      if (PROJECT_DIRECTORY_OPTION.equals(option)) {
        hasProjectDir = true;
      }
      if (FILE_OPTION.equals(option) || SHORT_FILE_OPTION.equals(option)) {
        hasFile = true;
      }
      if (ENV_FILE_OPTION.equals(option)) {
        hasEnvFile = true;
      }
    }
  }
}
