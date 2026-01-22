package io.github.georgecodes.benchmarking.orchestrator.resource;

import io.github.georgecodes.benchmarking.orchestrator.security.RequireOrchestratorAuth;
import io.github.georgecodes.benchmarking.orchestrator.application.CommandPolicy;
import io.github.georgecodes.benchmarking.orchestrator.application.JobManager;
import io.smallrye.mutiny.Multi;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.MediaType;
import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import io.github.georgecodes.benchmarking.orchestrator.api.JobStatusResponse;
import io.github.georgecodes.benchmarking.orchestrator.api.RunRequest;
import io.github.georgecodes.benchmarking.orchestrator.api.RunResponse;
import org.eclipse.microprofile.openapi.annotations.enums.SecuritySchemeType;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.ExampleObject;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.RequestBody;
import org.eclipse.microprofile.openapi.annotations.security.SecurityScheme;
import org.jboss.resteasy.reactive.RestStreamElementType;
import org.eclipse.microprofile.openapi.annotations.security.SecurityRequirement;

import java.util.UUID;

/**
 * REST resource for orchestrating command execution.
 * Provides endpoints for running commands, retrieving job status, and streaming events.
 * Delegates business logic to {@link CommandPolicy} and {@link JobManager}.
 */
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

  /**
   * Service for command validation and policy enforcement.
   */
  @Inject
  CommandPolicy policy;

  /**
   * Service for managing job execution and lifecycle.
   */
  @Inject
  JobManager jobs;

  /**
   * Submits a command for asynchronous execution.
   *
   * @param req the run request containing the command
   * @return run response with job ID
   * @throws BadRequestException if command is invalid
   */
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
    if (req == null || req.command() == null || req.command().isBlank()) {
      throw new BadRequestException("command is required");
    }
    var validated = policy.validate(req.command());
    String runId = req.runId();
    UUID id = jobs.submit(validated, runId);
    return new RunResponse(id, runId);
  }

  /**
   * Retrieves the status of a job.
   *
   * @param id the job ID
   * @return job status response
   */
  @GET
  @Path("/jobs/{id}")
  public JobStatusResponse status(@PathParam("id") UUID id, @QueryParam("runId") String runId) {
    jobs.validateRunId(id, runId);
    return jobs.status(id);
  }

  /**
   * Streams job events via Server-Sent Events.
   *
   * @param id the job ID
   * @return multi stream of job events
   */
  @GET
  @Path("/jobs/{id}/events")
  @Produces(MediaType.SERVER_SENT_EVENTS)
  @RestStreamElementType(MediaType.APPLICATION_JSON)
  public Multi<JobEvent> events(@PathParam("id") UUID id, @QueryParam("runId") String runId) {
    jobs.validateRunId(id, runId);
    return jobs.events(id);
  }
}
