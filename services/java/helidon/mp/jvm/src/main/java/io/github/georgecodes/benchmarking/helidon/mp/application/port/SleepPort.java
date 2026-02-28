package io.github.georgecodes.benchmarking.helidon.mp.application.port;

/**
 * Time/sleep abstraction.
 */
public interface SleepPort {

    void sleep(long duration, TimeUnit unit) throws InterruptedException;
}