package io.github.georgecodes.benchmarking.helidon.se.infra.time;

import io.github.georgecodes.benchmarking.helidon.se.application.port.SleepPort;
import io.github.georgecodes.benchmarking.helidon.se.application.port.TimeUnit;

import java.util.Objects;

public final class ThreadSleepAdapter implements SleepPort {

    @Override
    public void sleep(long duration, TimeUnit unit) throws InterruptedException {
        Objects.requireNonNull(unit, "unit");
        Thread.sleep(unit.toMillis(duration));
    }
}