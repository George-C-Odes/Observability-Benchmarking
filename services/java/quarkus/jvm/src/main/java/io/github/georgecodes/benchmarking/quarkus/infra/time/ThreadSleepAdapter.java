package io.github.georgecodes.benchmarking.quarkus.infra.time;

import io.github.georgecodes.benchmarking.quarkus.application.port.SleepPort;
import io.github.georgecodes.benchmarking.quarkus.application.port.TimeUnit;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class ThreadSleepAdapter implements SleepPort {
    @Override
    public void sleep(long amount, TimeUnit unit) throws InterruptedException {
        if (unit != TimeUnit.SECONDS) {
            throw new IllegalArgumentException("Only SECONDS supported");
        }
        Thread.sleep(amount * 1000L);
    }
}
