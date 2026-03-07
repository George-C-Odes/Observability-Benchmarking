package io.github.georgecodes.benchmarking.dropwizard.web;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/**
 * Minimal readiness endpoint for orchestration/liveness checks.
 */
@Path("/ready")
@Produces(MediaType.TEXT_PLAIN)
public final class ReadyResource {

    @GET
    public String ready() {
        return "UP";
    }
}