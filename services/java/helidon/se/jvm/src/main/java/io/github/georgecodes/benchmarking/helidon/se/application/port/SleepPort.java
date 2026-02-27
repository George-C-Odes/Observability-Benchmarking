package io.github.georgecodes.benchmarking.helidon.se.application.port;

public interface SleepPort {

    void sleep(long duration, TimeUnit unit) throws InterruptedException;
}