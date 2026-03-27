package io.github.georgecodes.benchmarking.orchestrator.application;

import io.smallrye.config.ConfigMapping;

import java.util.Optional;

/**
 * Strongly typed configuration for orchestrator project paths.
 *
 * <p>Uses SmallRye {@link ConfigMapping} so the optional {@code host-compose} property is expressed
 * as an {@link Optional} return type (the intended Java idiom) rather than an {@code Optional} field.
 */
@ConfigMapping(prefix = "orchestrator.project-paths")
public interface ProjectPathsConfig {

  /**
   * Host-side project directory (used when the orchestrator runs docker compose against a host Docker Engine).
   * When present, this path is treated as trusted (and does not need to be under the workspace root) to validate
   * compose-related paths.  It is not automatically injected as {@code --project-directory}.
   */
  Optional<String> hostCompose();

  /** Workspace path settings. */
  Workspace workspace();

  /** Nested workspace configuration. */
  interface Workspace {

    /** Workspace root directory. */
    String root();

    /** Compose directory (contains docker-compose.yml). */
    String compose();

    /** Path to the compose {@code .env} file. */
    String env();
  }
}