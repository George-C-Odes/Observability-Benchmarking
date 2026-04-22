package io.github.georgecodes.benchmarking.quarkus.infra.time;

import io.github.georgecodes.benchmarking.quarkus.application.port.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;

class ThreadSleepAdapterTest {

    @Test
    void sleepAllowsZeroSeconds() throws InterruptedException {
        new ThreadSleepAdapter().sleep(0, TimeUnit.SECONDS);
    }

    @Test
    void sleepRejectsUnsupportedUnits() {
        assertThrows(IllegalArgumentException.class, () -> new ThreadSleepAdapter().sleep(0, null));
    }
}

