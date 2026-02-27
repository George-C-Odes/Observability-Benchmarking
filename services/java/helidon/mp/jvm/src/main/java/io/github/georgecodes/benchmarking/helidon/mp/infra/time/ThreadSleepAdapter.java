package io.github.georgecodes.benchmarking.helidon.mp.infra.time;

import io.github.georgecodes.benchmarking.helidon.mp.application.port.SleepPort;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.TimeUnit;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Objects;

/**
 * Thread.sleep-backed {@link SleepPort} implementation.
 * On Helidon 4 MP, virtual threads are used by default.
 */
@ApplicationScoped
public class ThreadSleepAdapter implements SleepPort {

    @Override
    public void sleep(long duration, TimeUnit unit) throws InterruptedException {
        Objects.requireNonNull(unit, "unit");
        Thread.sleep(unit.toMillis(duration));
    }
}