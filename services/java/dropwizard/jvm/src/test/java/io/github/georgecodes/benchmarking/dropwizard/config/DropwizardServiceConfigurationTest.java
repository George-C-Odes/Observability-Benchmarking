package io.github.georgecodes.benchmarking.dropwizard.config;

import io.dropwizard.core.Configuration;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Unit tests for {@link DropwizardServiceConfiguration}.
 */
class DropwizardServiceConfigurationTest {

    @Test
    void extendsConfiguration() {
        DropwizardServiceConfiguration config = new DropwizardServiceConfiguration();
        assertInstanceOf(Configuration.class, config);
    }

    @Test
    void canBeInstantiated() {
        DropwizardServiceConfiguration config = new DropwizardServiceConfiguration();
        assertNotNull(config);
    }
}