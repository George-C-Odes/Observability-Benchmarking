package io.github.georgecodes.benchmarking.dropwizard.config;

import io.dropwizard.core.Configuration;

/**
 * Dropwizard YAML configuration holder.
 * <p>Most benchmark-relevant settings are read from environment variables
 * via {@link ServiceConfig#fromEnvironment()}.  This class satisfies the
 * Dropwizard {@link Configuration} contract and can be extended if
 * YAML-driven properties are needed in the future.</p>
 */
public class DropwizardServiceConfiguration extends Configuration {
}