package io.github.georgecodes.benchmarking.spring.netty.infra;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;

class ModuleConfigTest {

    private final ModuleConfig moduleConfig = new ModuleConfig();

    @Test
    void caffeineCacheIsInitializedWithConfiguredEntries() {
        Cache<String, String> cache = moduleConfig.caffeineCache(new ModuleConfig.CacheProperties(3));

        assertThat(cache.asMap()).containsExactlyInAnyOrderEntriesOf(Map.of(
            "1", "value-1",
            "2", "value-2",
            "3", "value-3"
        ));
    }

    @Test
    void reactiveCounterUsesExpectedMetricAndEndpoint() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        Counter counter = moduleConfig.helloReactiveCounter(registry);
        counter.increment(2);

        assertThat(counter.getId().getName()).isEqualTo("hello.request.count");
        assertThat(counter.getId().getTag("endpoint")).isEqualTo("/hello/reactive");
        assertThat(counter.count()).isEqualTo(2);
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
    void processThreadMetricsProvidesFallbackWhenNativeBinderRegistersNoGauge() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        try (var ignored = mockConstruction(ProcessThreadMetrics.class)) {
            // Simulate platforms where the native binder cannot supply process.threads.
            moduleConfig.processThreadMetrics().bindTo(registry);

            Gauge gauge = registry.get("process.threads").gauge();
            assertThat(gauge.value()).isPositive();
            assertThat(gauge.getId().getDescription()).isEqualTo("The number of process threads");
        } finally {
            registry.close();
        }
    }

    @Test
    void processThreadMetricsPreservesExistingGauge() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        try (var ignored = mockConstruction(ProcessThreadMetrics.class)) {
            Gauge existing = Gauge.builder("process.threads", () -> 42).register(registry);

            moduleConfig.processThreadMetrics().bindTo(registry);

            assertThat(registry.get("process.threads").gauge()).isSameAs(existing);
            assertThat(existing.value()).isEqualTo(42);
            assertThat(registry.getMeters()).hasSize(1);
        } finally {
            registry.close();
        }
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

