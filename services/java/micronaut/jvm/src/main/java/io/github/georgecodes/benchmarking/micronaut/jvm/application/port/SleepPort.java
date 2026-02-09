package io.github.georgecodes.benchmarking.micronaut.jvm.application.port;

public interface SleepPort {

    void sleep(long duration, TimeUnit unit) throws InterruptedException;
}