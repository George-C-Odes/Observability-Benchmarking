package io.github.georgecodes.benchmarking.spring.netty.config;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration class for Micrometer metrics setup in Spring.
 * Provides custom meter binders for process memory and thread metrics.
 */
@Configuration
public class MetricsConfig {

    /**
     * Creates a meter binder bean for process memory metrics.
     *
     * @return MeterBinder instance for process memory metrics
     */
    @Bean
    MeterBinder processMemoryMetrics() {
        return new ProcessMemoryMetrics();
    }

    /**
     * Creates a meter binder bean for process thread metrics.
     *
     * @return MeterBinder instance for process thread metrics
     */
    @Bean
    MeterBinder processThreadMetrics() {
        return new ProcessThreadMetrics();
    }
}
