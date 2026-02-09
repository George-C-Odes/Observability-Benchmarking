package io.github.georgecodes.benchmarking.quarkus.rest;

import io.github.georgecodes.benchmarking.quarkus.application.HelloService;
import io.github.georgecodes.benchmarking.quarkus.application.port.HelloMode;
import io.smallrye.common.annotation.Blocking;
import io.smallrye.common.annotation.RunOnVirtualThread;
import io.smallrye.mutiny.Uni;
import jakarta.inject.Inject;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import lombok.extern.jbosslog.JBossLog;

/**
 * REST resource providing hello endpoints with different thread models.
 * Used for benchmarking observability and performance characteristics.
 */
@JBossLog
@Path("/hello")
@Produces(MediaType.APPLICATION_JSON)
public class HelloResource {

    /**
     * Use-case service containing benchmark logic.
     */
    private final HelloService helloService;

    @Inject
    public HelloResource(HelloService helloService) {
        this.helloService = helloService;
        log.infov("Init thread: {0}", Thread.currentThread());
        var runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        log.infov("Heap in MB = Max:{0}, Total:{1}, Free:{2}", maxHeapMB, totalHeapMB, freeHeapMB);
        log.infov("Available Processors:{0}", runtime.availableProcessors());
    }

    /**
     * Handles requests using platform threads (standard JVM threads).
     *
     * @param sleepSeconds optional sleep duration in seconds for simulating work
     * @param printLog whether to log thread information
     * @return greeting message with cached value
     * @throws InterruptedException if the thread sleep is interrupted
     */
    @GET
    @Blocking
    @Path("/platform")
    public String helloPlatform(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) throws InterruptedException {
        if (printLog) {
            var currentThread = Thread.currentThread();
            log.infov("platform thread: {0}, isVirtual: {1}", currentThread, currentThread.isVirtual());
        }
        return helloService.hello(HelloMode.PLATFORM, sleepSeconds);
    }

    /**
     * Handles requests using virtual threads (Project Loom).
     *
     * @param sleepSeconds optional sleep duration in seconds for simulating work
     * @param printLog whether to log thread information
     * @return greeting message with cached value
     * @throws InterruptedException if the thread sleep is interrupted
     */
    @GET
    @Path("/virtual")
    @RunOnVirtualThread
    public String helloVirtual(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) throws InterruptedException {
        if (printLog) {
            var currentThread = Thread.currentThread();
            log.infov("virtual thread: {0}, isVirtual: {1}", currentThread, currentThread.isVirtual());
        }
        return helloService.hello(HelloMode.VIRTUAL, sleepSeconds);
    }

    /**
     * Handles requests using reactive programming model with Mutiny.
     *
     * @param sleepSeconds optional sleep duration in seconds (not recommended under load)
     * @param printLog whether to log thread information
     * @return Uni with greeting message and cached value
     */
    @GET
    @Path("/reactive")
    public Uni<String> helloReactive(
        @QueryParam("sleep") @DefaultValue("0") int sleepSeconds,
        @QueryParam("log") @DefaultValue("false") boolean printLog
    ) {
        return Uni.createFrom().item(() -> {
            if (printLog) {
                var currentThread = Thread.currentThread();
                log.infov("reactive thread: {0}, isVirtual: {1}", currentThread, currentThread.isVirtual());
            }
            try {
                return helloService.hello(HelloMode.REACTIVE, sleepSeconds);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return "Interrupted";
            }
        });
    }
}