package io.github.georgecodes.benchmarking.helidon.mp.web;

import io.github.georgecodes.benchmarking.helidon.mp.application.HelloService;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.HelloMode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import lombok.extern.slf4j.Slf4j;


/**
 * JAX-RS resource for the hello benchmark endpoint.
 * <p>
 * Helidon MP 4 runs every request on a virtual thread by default —
 * no executor annotation or reactive return type is needed.
 * <p>
 * Every request hits the Caffeine cache to simulate a realistic
 * service lookup, consistent with all other benchmark modules.
 */
@Slf4j
@Path("/hello")
@ApplicationScoped
public class HelloResource {

    /** Application service that implements the hello benchmark behavior. */
    private final HelloService helloService;

    @Inject
    public HelloResource(HelloService helloService) {
        this.helloService = helloService;
    }


    /**
     * Virtual-thread endpoint — the only mode for Helidon 4.
     */
    @GET
    @Path("/virtual")
    @Produces(MediaType.APPLICATION_JSON)
    public String virtual(
            @QueryParam("sleep") @DefaultValue("0") int sleep,
            @QueryParam("log") @DefaultValue("false") boolean printLog
    ) throws InterruptedException {

        if (printLog) {
            var currentThread = Thread.currentThread();
            log.info("{} thread: '{}' (name='{}'), isVirtual: '{}'",
                    HelloMode.VIRTUAL.label(), currentThread,
                    currentThread.getName(), currentThread.isVirtual());
        }

        return helloService.hello(HelloMode.VIRTUAL, sleep);
    }
}