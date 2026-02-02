package io.github.georgecodes.benchmarking.spring.netty.application;

import io.github.georgecodes.benchmarking.spring.netty.application.port.CachePort;
import io.micrometer.core.instrument.Counter;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class HelloService {
    /** Cache port (injected adapter) used to fetch pre-warmed values. */
    private final CachePort cache;

    /** Request counter for the reactive endpoint. */
    private final Counter reactiveCounter;

    public HelloService(CachePort cache, Counter reactiveCounter) {
        this.cache = cache;
        this.reactiveCounter = reactiveCounter;
    }

    public @NonNull String reactiveHello(int sleepSeconds, boolean printLog) {
        if (printLog) {
            log.info("reactive thread: '{}'", Thread.currentThread());
        }
        reactiveCounter.increment();
        if (sleepSeconds > 0) {
            try {
                Thread.sleep(sleepSeconds * 1000L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        return "Hello from Boot reactive REST " + cache.get("1");
    }
}