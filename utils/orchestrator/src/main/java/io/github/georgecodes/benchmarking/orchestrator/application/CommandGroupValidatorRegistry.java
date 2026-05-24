package io.github.georgecodes.benchmarking.orchestrator.application;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

/** Registry of CDI-provided Docker command-group validators. */
@ApplicationScoped
public class CommandGroupValidatorRegistry {

  /** Validators keyed by Docker command-group token. */
  private final Map<String, CommandGroupValidator> validators;

  /**
   * Creates a validator registry from CDI-discovered validators.
   *
   * @param validators command-group validators
   */
  @Inject
  public CommandGroupValidatorRegistry(Instance<CommandGroupValidator> validators) {
    this(
        StreamSupport.stream(validators.spliterator(), false)
            .collect(Collectors.toMap(CommandGroupValidator::commandGroup, Function.identity())));
  }

  /**
   * Creates a validator registry from an explicit collection.
   *
   * @param validators command-group validators
   */
  public CommandGroupValidatorRegistry(Collection<CommandGroupValidator> validators) {
    this(
        validators.stream()
            .collect(Collectors.toMap(CommandGroupValidator::commandGroup, Function.identity())));
  }

  private CommandGroupValidatorRegistry(Map<String, CommandGroupValidator> validators) {
    this.validators = Map.copyOf(validators);
  }

  /**
   * Looks up the validator for a Docker command group.
   *
   * @param commandGroup Docker command-group token
   * @return matching validator when registered
   */
  public Optional<CommandGroupValidator> find(String commandGroup) {
    return Optional.ofNullable(validators.get(commandGroup));
  }
}
