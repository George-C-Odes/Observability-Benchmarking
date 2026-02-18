package io.github.georgecodes.benchmarking.micronaut.jvm.web;

import io.github.georgecodes.benchmarking.micronaut.jvm.application.HelloService;
import io.github.georgecodes.benchmarking.micronaut.jvm.application.port.HelloMode;
import io.micronaut.core.annotation.Blocking;
import io.micronaut.core.annotation.NonBlocking;
import io.micronaut.core.version.VersionUtils;
import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.annotation.QueryValue;
import io.micronaut.scheduling.annotation.ExecuteOn;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;

@Controller("/hello")
@Produces(MediaType.APPLICATION_JSON)
@Slf4j
public class HelloController {

    /** Use-case service handling hello responses. */
    private final HelloService helloService;

    public HelloController(HelloService helloService) {
        log.info("Micronaut version: {}", VersionUtils.getMicronautVersion());
        this.helloService = helloService;
        log.info("Init thread: {}", Thread.currentThread());
        Runtime runtime = Runtime.getRuntime();
        log.info("Heap in MB = Max:{}, Total:{}, Free:{}",
            runtime.maxMemory() / 1024 / 1024,
            runtime.totalMemory() / 1024 / 1024,
            runtime.freeMemory() / 1024 / 1024);
        log.info("Available Processors:{}", runtime.availableProcessors());
    }

    @Get(uri = "/platform{?sleep,log}")
    @Blocking
    @ExecuteOn("platform")
    public String platform(
        @QueryValue(value = "sleep", defaultValue = "0") int sleep,
        @QueryValue(value = "log", defaultValue = "false") boolean printLog
    ) {
        if (printLog) {
            var currentThread = Thread.currentThread();
            log.info(
                "platform thread: '{}' (name='{}'), isVirtual: '{}'",
                currentThread, currentThread.getName(), currentThread.isVirtual()
            );
        }
        return helloService.hello(HelloMode.PLATFORM, sleep);
    }

    @Get(uri = "/virtual{?sleep,log}")
    @ExecuteOn("virtual")
    public String virtual(
        @QueryValue(value = "sleep", defaultValue = "0") int sleep,
        @QueryValue(value = "log", defaultValue = "false") boolean printLog
    ) {
        if (printLog) {
            var currentThread = Thread.currentThread();
            log.info(
                "virtual thread: '{}' (name='{}'), isVirtual: '{}'",
                currentThread, currentThread.getName(), currentThread.isVirtual()
            );
        }
        return helloService.hello(HelloMode.VIRTUAL, sleep);
    }

    // Experimental, excluded from benchmarks
    @Get(uri = "/virtual-event-loop{?sleep,log}")
    @NonBlocking
    public String virtualEventLoop(
        @QueryValue(value = "sleep", defaultValue = "0") int sleep,
        @QueryValue(value = "log", defaultValue = "false") boolean printLog
    ) {
        if (printLog) {
            var currentThread = Thread.currentThread();
            log.info(
                "virtual(event-loop) thread: '{}' (name='{}'), isVirtual: '{}'",
                currentThread, currentThread.getName(), currentThread.isVirtual()
            );
        }
        return helloService.hello(HelloMode.VIRTUAL_CARRIER, sleep);
    }

    @Get(uri = "/reactive{?sleep,log}")
    @NonBlocking
    public Mono<String> reactive(
        @QueryValue(value = "sleep", defaultValue = "0") int sleep,
        @QueryValue(value = "log", defaultValue = "false") boolean printLog
    ) {
        return Mono.fromSupplier(() -> {
            if (printLog) {
                var currentThread = Thread.currentThread();
                log.info(
                    "reactive thread: '{}' (name='{}'), isVirtual: '{}'",
                    currentThread, currentThread.getName(), currentThread.isVirtual()
                );
            }
            return helloService.hello(HelloMode.REACTIVE, sleep);
        });
    }
}