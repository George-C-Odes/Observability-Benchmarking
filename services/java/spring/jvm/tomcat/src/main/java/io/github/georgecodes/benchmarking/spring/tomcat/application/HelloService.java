package io.github.georgecodes.benchmarking.spring.tomcat.application;

import io.github.georgecodes.benchmarking.spring.tomcat.application.port.CachePort;
import io.micrometer.core.instrument.Counter;
import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class HelloService {

    /** Cache port (injected adapter) used to fetch pre-warmed values. */
    private final CachePort cache;

    /** Request counter for the platform-thread endpoint. */
    private final Counter platformCounter;

    /** Request counter for the virtual-thread endpoint. */
    private final Counter virtualCounter;

    public HelloService(
        CachePort cache,
        @Qualifier("helloPlatformCounter") Counter platformCounter,
        @Qualifier("helloVirtualCounter") Counter virtualCounter
    ) {
        this.cache = cache;
        this.platformCounter = platformCounter;
        this.virtualCounter = virtualCounter;
    }

    public @NonNull String platformHello(int sleepSeconds) {
        platformCounter.increment();
        sleep(sleepSeconds);
        return "Hello from Boot platform REST " + cache.get("1");
    }

    public @NonNull String virtualHello(int sleepSeconds) {
        virtualCounter.increment();
        sleep(sleepSeconds);
        return "Hello from Boot virtual REST " + cache.get("1");
    }

    private void sleep(int sleepSeconds) {
        if (sleepSeconds <= 0) {
            return;
        }
        try {
            Thread.sleep(sleepSeconds * 1000L);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}