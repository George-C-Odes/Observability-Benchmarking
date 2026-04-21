package io.github.georgecodes.benchmarking.micronaut.infra.time;

import io.github.georgecodes.benchmarking.micronaut.application.port.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ThreadSleepAdapterTest {

    private final ThreadSleepAdapter sleepAdapter = new ThreadSleepAdapter();

    @Test
    void sleepAcceptsSeconds() throws InterruptedException {
        sleepAdapter.sleep(0, TimeUnit.SECONDS);
    }

    @Test
    void sleepRejectsUnsupportedUnits() {
        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class,
            () -> sleepAdapter.sleep(0, null));

        assertEquals("Unsupported unit: null", exception.getMessage());
    }
}

