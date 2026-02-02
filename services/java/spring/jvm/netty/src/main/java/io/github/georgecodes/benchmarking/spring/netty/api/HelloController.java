package io.github.georgecodes.benchmarking.spring.netty.api;

import io.github.georgecodes.benchmarking.spring.netty.application.HelloService;
import org.jspecify.annotations.NonNull;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping(value = "/hello", produces = MediaType.APPLICATION_JSON_VALUE)
public class HelloController {
    /** Application use-case for producing hello payloads. */
    private final HelloService helloService;

    public HelloController(HelloService helloService) {
        this.helloService = helloService;
    }

    @GetMapping(value = "/reactive")
    public Mono<@NonNull String> reactive(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) {
        return Mono.fromSupplier(() -> helloService.reactiveHello(sleepSeconds, printLog));
    }
}