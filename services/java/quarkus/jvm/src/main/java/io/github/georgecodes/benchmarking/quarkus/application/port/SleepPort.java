package io.github.georgecodes.benchmarking.quarkus.application.port;

public interface SleepPort {
    void sleep(long amount, TimeUnit unit) throws InterruptedException;
}