package io.github.georgecodes.benchmarking.spring.tomcat.infra;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
@EnableConfigurationProperties(ModuleConfig.CacheProperties.class)
public class ModuleConfig {

    @Bean
    public Cache<@NonNull String, String> caffeineCache(CacheProperties cacheProperties) {
        long cacheSize = cacheProperties.size();
        Cache<@NonNull String, String> cache = Caffeine.newBuilder()
            .maximumSize(cacheSize)
            .expireAfterWrite(Duration.ofDays(1))
            .build();
        for (long i = cacheSize; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }
        return cache;
    }

    @Bean
    @ConditionalOnProperty(
        name = "spring.threads.virtual.enabled",
        havingValue = "false",
        matchIfMissing = true
    )
    public Counter helloPlatformCounter(MeterRegistry registry) {
        return Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/platform")
            .register(registry);
    }

    @Bean(name = "helloRequestCounter")
    @ConditionalOnProperty(
        name = "spring.threads.virtual.enabled",
        havingValue = "false",
        matchIfMissing = true
    )
    public Counter helloPlatformRequestCounterAlias(Counter helloPlatformCounter) {
        return helloPlatformCounter;
    }

    @Bean
    @ConditionalOnProperty(name = "spring.threads.virtual.enabled", havingValue = "true")
    public Counter helloVirtualCounter(MeterRegistry registry) {
        return Counter.builder("hello.request.count")
            .tag("endpoint", "/hello/virtual")
            .register(registry);
    }

    @Bean(name = "helloRequestCounter")
    @ConditionalOnProperty(name = "spring.threads.virtual.enabled", havingValue = "true")
    public Counter helloVirtualRequestCounterAlias(Counter helloVirtualCounter) {
        return helloVirtualCounter;
    }

    @Bean
    MeterBinder processMemoryMetrics() {
        return new ProcessMemoryMetrics();
    }

    @Bean
    MeterBinder processThreadMetrics() {
        return new ProcessThreadMetrics();
    }

    @Configuration
    @Slf4j
    static class StartupLogging {
        @Bean
        ApplicationRunner logRuntimeInfo() {
            return _ -> {
                var runtime = Runtime.getRuntime();
                long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
                long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
                long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
                log.info("Heap in MB = Max:{}, Total:{}, Free:{}", maxHeapMB, totalHeapMB, freeHeapMB);
                log.info("Available Processors:{}", runtime.availableProcessors());
            };
        }
    }

    @ConfigurationProperties(prefix = "benchmark.cache")
    public record CacheProperties(long size) {
        public CacheProperties {
            if (size <= 0) {
                size = 50_000;
            }
        }
    }
}