package io.github.georgecodes.benchmarking.helidon.mp.infra.time;

import io.github.georgecodes.benchmarking.helidon.mp.application.port.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;

class ThreadSleepAdapterTest {

    private final ThreadSleepAdapter adapter = new ThreadSleepAdapter();

    @Test
    void sleepAcceptsZeroDuration() throws InterruptedException {
        adapter.sleep(0, TimeUnit.MILLISECONDS);
    }

    @Test
    void sleepRejectsNullTimeUnit() {
        assertThrows(NullPointerException.class, () -> adapter.sleep(0, null));
    }
}
