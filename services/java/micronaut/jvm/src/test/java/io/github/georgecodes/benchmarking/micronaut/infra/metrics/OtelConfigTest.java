package io.github.georgecodes.benchmarking.micronaut.infra.metrics;

import io.micrometer.core.instrument.Gauge;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.metrics.SdkMeterProvider;
import io.opentelemetry.sdk.metrics.data.AggregationTemporality;
import io.opentelemetry.sdk.metrics.data.DoublePointData;
import io.opentelemetry.sdk.metrics.data.MetricData;
import io.opentelemetry.sdk.metrics.InstrumentType;
import io.opentelemetry.sdk.metrics.export.MetricExporter;
import io.opentelemetry.sdk.metrics.export.PeriodicMetricReader;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OtelConfigTest {

    @Test
    void unitlessQueueRegisteredFirstExportsBothExecutors() {
        assertBothExecutorsExported(true);
    }

    @Test
    void taskQueueRegisteredFirstExportsBothExecutors() {
        assertBothExecutorsExported(false);
    }

    private static void assertBothExecutorsExported(boolean unitlessFirst) {
        var exported = new AtomicReference<Collection<MetricData>>(List.of());
        MetricExporter exporter = new MetricExporter() {
            @Override
            public CompletableResultCode export(Collection<MetricData> metrics) {
                exported.set(metrics);
                return CompletableResultCode.ofSuccess();
            }

            @Override
            public CompletableResultCode flush() {
                return CompletableResultCode.ofSuccess();
            }

            @Override
            public CompletableResultCode shutdown() {
                return CompletableResultCode.ofSuccess();
            }

            @Override
            public AggregationTemporality getAggregationTemporality(InstrumentType instrumentType) {
                return AggregationTemporality.CUMULATIVE;
            }
        };
        var reader = PeriodicMetricReader.builder(exporter).build();
        var provider = SdkMeterProvider.builder().registerMetricReader(reader).build();
        try (var telemetry = OpenTelemetrySdk.builder().setMeterProvider(provider).build()) {
            var registry = new OtelConfig().otelMeterRegistry(telemetry);
            try {
                // Match Micronaut's Netty binder (no unit) and Micrometer's thread-pool binder (tasks).
                var netty = Gauge.builder("executor.queued", () -> 3.0).tag("name", "default");
                var platform = Gauge.builder("executor.queued", () -> 7.0)
                    .tag("name", "platform").baseUnit("tasks");
                if (unitlessFirst) {
                    netty.register(registry);
                    platform.register(registry);
                } else {
                    platform.register(registry);
                    netty.register(registry);
                }
                reader.forceFlush().join(10, java.util.concurrent.TimeUnit.SECONDS);
                var queues = exported.get().stream()
                    .filter(metric -> metric.getName().equals("executor.queued"))
                    .toList();
                assertEquals(1, queues.size(), "Queue gauges must share one compatible OTel instrument");
                assertEquals("tasks", queues.getFirst().getUnit());
                var points = queues.getFirst().getDoubleGaugeData().getPoints();
                assertEquals(2, points.size(), "Both executor tag sets must be exported");
                assertEquals(List.of(3.0, 7.0), points.stream().map(DoublePointData::getValue).sorted().toList());
            } finally {
                registry.close();
            }
        }
    }
}
