package io.github.georgecodes.benchmarking.spring.tomcat.api;

import io.github.georgecodes.benchmarking.spring.tomcat.application.HelloService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform-thread Tomcat endpoint.
 * This controller is only registered when virtual threads are disabled.
 */
@RestController
@RequestMapping(value = "/hello", produces = MediaType.APPLICATION_JSON_VALUE)
@ConditionalOnProperty(
    name = "spring.threads.virtual.enabled",
    havingValue = "false",
    matchIfMissing = true
)
@Slf4j
public class HelloPlatformController {

    /** Application use-case for producing hello payloads. */
    private final HelloService helloService;

    public HelloPlatformController(HelloService helloService) {
        this.helloService = helloService;
    }

    @GetMapping(value = "/platform")
    public String platform(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) {
        if (printLog) {
            var currentThread = Thread.currentThread();
            log.info("platform thread: '{}', isVirtual: '{}'", currentThread, currentThread.isVirtual());
        }
        return helloService.platformHello(sleepSeconds);
    }
}