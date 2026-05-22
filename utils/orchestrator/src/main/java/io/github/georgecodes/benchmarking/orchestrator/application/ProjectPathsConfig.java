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
   *
   * @return the optional host-side compose path override
   */
  Optional<String> hostCompose();

  /**
   * Returns workspace path settings for project-relative resources.
   *
   * @return the nested workspace path configuration
   */
  Workspace workspace();

  /** Nested workspace configuration. */
  interface Workspace {

    /**
     * Returns the workspace root directory.
     *
     * @return the workspace root directory
     */
    String root();

    /**
     * Returns the compose directory containing {@code docker-compose.yml}.
     *
     * @return the compose directory path
     */
    String compose();

    /**
     * Returns the path to the compose {@code .env} file.
     *
     * @return the compose environment file path
     */
    String env();

    /**
     * Returns the path to the benchmark targets file ({@code config/benchmark-targets.txt}).
     *
     * @return the benchmark targets file path
     */
    String benchmarkTargets();
  }
}