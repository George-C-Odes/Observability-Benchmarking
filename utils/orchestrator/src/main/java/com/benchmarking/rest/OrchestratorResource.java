package com.benchmarking.rest;

import com.benchmarking.security.RequireOrchestratorAuth;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import com.benchmarking.api.JobEvent;
import com.benchmarking.api.JobStatusResponse;
import com.benchmarking.api.RunRequest;
import com.benchmarking.api.RunResponse;
import com.benchmarking.core.CommandPolicy;
import com.benchmarking.core.JobManager;
import org.eclipse.microprofile.openapi.annotations.enums.SecuritySchemeType;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.ExampleObject;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.RequestBody;
import org.eclipse.microprofile.openapi.annotations.security.SecurityScheme;
import org.jboss.resteasy.reactive.RestStreamElementType;
import org.eclipse.microprofile.openapi.annotations.security.SecurityRequirement;

import java.util.UUID;

@Path("/v1")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@SecurityScheme(
  securitySchemeName = "orchestratorAuth",
  type = SecuritySchemeType.HTTP,
  scheme = "bearer",
  bearerFormat = "API-Key"
)
public class OrchestratorResource {

  @Inject
  CommandPolicy policy;

  @Inject
  JobManager jobs;

  @POST
  @Path("/run")
  @RequireOrchestratorAuth
  @SecurityRequirement(name = "orchestratorAuth")
  @RequestBody(
    content = @Content(
      mediaType = "application/json",
      schema = @Schema(implementation = RunRequest.class),
      examples = @ExampleObject(name = "default", value = "{\"command\":\"docker ps\"}")
    )
  )
  public RunResponse run(RunRequest req) {
    if (req == null || req.command == null || req.command.isBlank()) {
      throw new BadRequestException("command is required");
    }
    var validated = policy.validate(req.command);
    UUID id = jobs.submit(validated);
    return new RunResponse(id);
  }

  @GET
  @Path("/jobs/{id}")
  public JobStatusResponse status(@PathParam("id") UUID id) {
    return jobs.status(id);
  }

  @GET
  @Path("/jobs/{id}/events")
  @Produces(MediaType.SERVER_SENT_EVENTS)
  @RestStreamElementType(MediaType.APPLICATION_JSON)
  public Multi<JobEvent> events(@PathParam("id") UUID id) {
    return jobs.events(id);
  }
}
