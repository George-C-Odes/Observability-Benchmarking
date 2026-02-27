package io.github.georgecodes.benchmarking.micronaut.application.port;

public interface SleepPort {

    void sleep(long duration, TimeUnit unit) throws InterruptedException;
}