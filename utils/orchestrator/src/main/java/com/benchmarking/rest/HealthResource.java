package com.benchmarking.rest;

import com.benchmarking.api.HealthAggregateResponse;
import com.benchmarking.service.ServiceHealthService;
import io.smallrye.mutiny.Uni;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.util.Optional;

/**
 * Aggregated service health endpoint.
 * <p>
 * This is intentionally in the orchestrator so UI clients (web/mobile) don't need to know
 * internal docker-compose DNS names.
 */
@Path("/v1/health")
@Produces(MediaType.APPLICATION_JSON)
@Tag(name = "Health")
public class HealthResource {

  /** Service that aggregates health from upstream services. */
  @Inject
  ServiceHealthService health;

  @GET
  @Operation(summary = "Aggregate readiness/health of the whole stack")
  @APIResponse(responseCode = "200", description = "Aggregated health")
  public Uni<HealthAggregateResponse> get(@QueryParam("service") String service) {
    return health.checkAll(Optional.ofNullable(service).filter(s -> !s.isBlank()));
  }
}