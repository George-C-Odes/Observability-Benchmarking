package io.github.georgecodes.benchmarking.spring.tomcat.infra;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

class ModuleConfigTest {

    private final ModuleConfig moduleConfig = new ModuleConfig();

    @Test
    void caffeineCacheIsInitializedWithConfiguredEntries() {
        Cache<String, String> cache = moduleConfig.caffeineCache(new ModuleConfig.CacheProperties(3));

        assertThat(cache.asMap()).containsExactlyInAnyOrderEntriesOf(java.util.Map.of(
            "1", "value-1",
            "2", "value-2",
            "3", "value-3"
        ));
    }

    @Test
    void platformCounterAndAliasShareTheSameMeter() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        Counter counter = moduleConfig.helloPlatformCounter(registry);
        Counter alias = moduleConfig.helloPlatformRequestCounterAlias(counter);
        counter.increment(2);

        assertThat(alias).isSameAs(counter);
        assertThat(counter.getId().getName()).isEqualTo("hello.request.count");
        assertThat(counter.getId().getTag("endpoint")).isEqualTo("/hello/platform");
        assertThat(alias.count()).isEqualTo(2);
    }

    @Test
    void virtualCounterAndAliasShareTheSameMeter() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        Counter counter = moduleConfig.helloVirtualCounter(registry);
        Counter alias = moduleConfig.helloVirtualRequestCounterAlias(counter);
        counter.increment();

        assertThat(alias).isSameAs(counter);
        assertThat(counter.getId().getTag("endpoint")).isEqualTo("/hello/virtual");
        assertThat(alias.count()).isEqualTo(1);
    }

    @Test
    void processMemoryMetricsBindsMeters() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        var binder = moduleConfig.processMemoryMetrics();

        assertThat(binder).isInstanceOf(ProcessMemoryMetrics.class);
        assertDoesNotThrow(() -> binder.bindTo(registry));
    }

    @Test
    void processThreadMetricsRegistersProcessThreadsGauge() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        moduleConfig.processThreadMetrics().bindTo(registry);

        assertThat(registry.find("process.threads").gauge()).isNotNull();
    }

    @Test
    void processThreadMetricsCanBeBoundMoreThanOnce() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        moduleConfig.processThreadMetrics().bindTo(registry);
        int meterCount = registry.getMeters().size();

        assertDoesNotThrow(() -> moduleConfig.processThreadMetrics().bindTo(registry));
        assertThat(registry.getMeters()).hasSize(meterCount);
    }

    @Test
    void nonPositiveCacheSizeUsesDefault() {
        assertEquals(50_000, new ModuleConfig.CacheProperties(0).size());
        assertEquals(50_000, new ModuleConfig.CacheProperties(-1).size());
        assertEquals(4, new ModuleConfig.CacheProperties(4).size());
    }

    @Test
    void startupLoggingRunnerCanRun() {
        ApplicationRunner runner = new ModuleConfig.StartupLogging().logRuntimeInfo();

        ApplicationArguments arguments = mock(ApplicationArguments.class);
        assertDoesNotThrow(() -> runner.run(arguments));
    }
}