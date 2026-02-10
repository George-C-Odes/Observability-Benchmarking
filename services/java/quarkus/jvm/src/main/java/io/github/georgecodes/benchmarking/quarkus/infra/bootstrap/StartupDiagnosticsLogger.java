package io.github.georgecodes.benchmarking.quarkus.infra.bootstrap;

import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import lombok.extern.jbosslog.JBossLog;

/**
 * Infrastructure bootstrap logger.
 *
 * <p>Keeps environment/runtime diagnostics out of REST adapters to preserve clean architecture
 * boundaries. This runs once on startup.
 */
@JBossLog
@ApplicationScoped
public class StartupDiagnosticsLogger {

    void onStart(@Observes StartupEvent event) {
        log.infov("Init thread: {0}", Thread.currentThread());

        Runtime runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;

        log.infov("Heap in MB = Max:{0}, Total:{1}, Free:{2}", maxHeapMB, totalHeapMB, freeHeapMB);
        log.infov("Available Processors:{0}", runtime.availableProcessors());
    }
}

