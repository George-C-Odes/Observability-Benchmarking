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

    /** Request counter for whichever endpoint is active in this runtime. */
    private final Counter requestCounter;

    public HelloService(CachePort cache, @Qualifier("helloRequestCounter") Counter requestCounter) {
        this.cache = cache;
        this.requestCounter = requestCounter;
    }

    public @NonNull String platformHello(int sleepSeconds) {
        requestCounter.increment();
        sleep(sleepSeconds);
        return "Hello from Boot platform REST " + cache.get("1");
    }

    public @NonNull String virtualHello(int sleepSeconds) {
        requestCounter.increment();
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