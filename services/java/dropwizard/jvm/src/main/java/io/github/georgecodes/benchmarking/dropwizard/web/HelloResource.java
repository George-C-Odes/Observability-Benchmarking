package io.github.georgecodes.benchmarking.dropwizard.web;

import io.github.georgecodes.benchmarking.dropwizard.config.ServiceConfig;
import io.github.georgecodes.benchmarking.dropwizard.domain.HelloService;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;

/**
 * JAX-RS resource for the hello benchmarking endpoints.
 * <p>Depending on {@link ServiceConfig.ThreadMode}, only one of
 * {@code /hello/platform} or {@code /hello/virtual} is active.
 * The inactive endpoint returns HTTP 500.</p>
 */
@Path("/hello")
@Produces(MediaType.APPLICATION_JSON)
public final class HelloResource {

    /** Logger for request/thread debug output. */
    private static final Logger LOG = LoggerFactory.getLogger(HelloResource.class);

    /** Service configuration (thread mode). */
    private final ServiceConfig config;
    /** Pure domain logic for hello responses. */
    private final HelloService helloService;
    /** Request counter for the active hello endpoint. */
    private final Counter helloCounter;

    /**
     * Parsed request params for /hello endpoints.
     *
     * @param sleepSeconds optional sleep duration in seconds (0 = no sleep)
     * @param log whether to log thread information for the request
     */
    private record HelloParams(int sleepSeconds, boolean log) { }

    public HelloResource(
        ServiceConfig config,
        HelloService helloService,
        MeterRegistry meterRegistry
    ) {
        this.config = Objects.requireNonNull(config, "config");
        this.helloService = Objects.requireNonNull(helloService, "helloService");
        Objects.requireNonNull(meterRegistry, "meterRegistry");

        String endpointTagValue = switch (config.threadMode()) {
            case PLATFORM -> "/hello/platform";
            case VIRTUAL -> "/hello/virtual";
        };

        this.helloCounter = Counter.builder("hello.request.count")
            .tag("endpoint", endpointTagValue)
            .register(meterRegistry);
    }

    @GET
    @Path("/platform")
    public Response helloPlatform(
        @QueryParam("sleep") @DefaultValue("0") int sleep,
        @QueryParam("log") @DefaultValue("false") boolean log
    ) throws InterruptedException {
        if (config.threadMode() != ServiceConfig.ThreadMode.PLATFORM) {
            return Response.serverError()
                .entity("\"Endpoint /hello/platform not active (THREAD_MODE="
                    + config.threadMode() + ")\"")
                .build();
        }
        helloCounter.increment();
        logThread(new HelloParams(sleep, log), "platform");
        String result = helloService.handle("Hello from Dropwizard platform REST ", sleep);
        return Response.ok(result).build();
    }

    @GET
    @Path("/virtual")
    public Response helloVirtual(
        @QueryParam("sleep") @DefaultValue("0") int sleep,
        @QueryParam("log") @DefaultValue("false") boolean log
    ) throws InterruptedException {
        if (config.threadMode() != ServiceConfig.ThreadMode.VIRTUAL) {
            return Response.serverError()
                .entity("\"Endpoint /hello/virtual not active (THREAD_MODE="
                    + config.threadMode() + ")\"")
                .build();
        }
        helloCounter.increment();
        logThread(new HelloParams(sleep, log), "virtual");
        String result = helloService.handle("Hello from Dropwizard virtual REST ", sleep);
        return Response.ok(result).build();
    }

    private static void logThread(HelloParams params, String mode) {
        if (!params.log()) {
            return;
        }
        var currentThread = Thread.currentThread();
        LOG.info("{} thread: '{}', isVirtual: '{}'", mode, currentThread, currentThread.isVirtual());
    }
}