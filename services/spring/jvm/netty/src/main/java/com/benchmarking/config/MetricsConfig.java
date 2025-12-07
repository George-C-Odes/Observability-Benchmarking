package com.benchmarking.config;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MetricsConfig {
//    @Bean
//    TimedAspect timedAspect(MeterRegistry registry) {
//        return new TimedAspect(registry);
//    }
//    @Bean
//    CountedAspect countedAspect(MeterRegistry registry) {
//        return new CountedAspect(registry);
//    }

    @Bean
    MeterBinder processMemoryMetrics() {
        return new ProcessMemoryMetrics();
    }
    @Bean
    MeterBinder processThreadMetrics() {
        return new ProcessThreadMetrics();
    }
}