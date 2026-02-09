package io.github.georgecodes.benchmarking.micronaut.jvm.infra.time;

import io.github.georgecodes.benchmarking.micronaut.jvm.application.port.SleepPort;
import io.github.georgecodes.benchmarking.micronaut.jvm.application.port.TimeUnit;
import jakarta.inject.Singleton;

@Singleton
public final class ThreadSleepAdapter implements SleepPort {

    @Override
    public void sleep(long duration, TimeUnit unit) throws InterruptedException {
        if (unit != TimeUnit.SECONDS) {
            throw new IllegalArgumentException("Unsupported unit: " + unit);
        }
        Thread.sleep(duration * 1000L);
    }
}