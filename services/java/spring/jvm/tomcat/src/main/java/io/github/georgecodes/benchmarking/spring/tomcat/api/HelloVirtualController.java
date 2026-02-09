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
 * Virtual-thread Tomcat endpoint.
 * This controller is only registered when virtual threads are enabled.
 */
@RestController
@RequestMapping(value = "/hello", produces = MediaType.APPLICATION_JSON_VALUE)
@ConditionalOnProperty(name = "spring.threads.virtual.enabled", havingValue = "true")
@Slf4j
public class HelloVirtualController {

    /** Application use-case for producing hello payloads. */
    private final HelloService helloService;

    public HelloVirtualController(HelloService helloService) {
        this.helloService = helloService;
    }

    @GetMapping(value = "/virtual")
    public String virtual(
        @RequestParam(name = "sleep", defaultValue = "0") int sleepSeconds,
        @RequestParam(name = "log", defaultValue = "false") boolean printLog
    ) {
        if (printLog) {
            var currentThread = Thread.currentThread();
            log.info("virtual thread: '{}', isVirtual: '{}'", currentThread, currentThread.isVirtual());
        }
        return helloService.virtualHello(sleepSeconds);
    }
}