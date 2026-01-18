package com.benchmarking.resource;

import com.benchmarking.security.RequireOrchestratorAuth;
import com.benchmarking.application.EnvFileService;
import com.benchmarking.application.EnvFileService.EnvFileContent;
import com.benchmarking.application.EnvFileService.EnvFileException;
import com.benchmarking.application.EnvFileService.EnvFileUpdate;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.RequestBody;
import org.eclipse.microprofile.openapi.annotations.security.SecurityRequirement;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.util.Map;

/**
 * REST resource for managing environment configuration files.
 * Provides endpoints for retrieving and updating the compose/.env file.
 * Delegates business logic to {@link EnvFileService}.
 */
@Path("/v1/env")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Environment")
public class EnvResource {

    /**
     * Service for environment file operations.
     */
    @Inject
    EnvFileService envFileService;

    /**
     * Get the content of the environment file.
     *
     * @return JSON response containing the file content
     */
    @GET
    @Operation(summary = "Retrieve environment file content")
    public Response getEnvFile() {
        try {
            EnvFileContent content = envFileService.readEnvFile();
            return Response.ok(Map.of(
                    "content", content.content(), 
                    "path", content.absolutePath()
            )).build();
        } catch (EnvFileException e) {
            return buildErrorResponse(e);
        }
    }

    /**
     * Request body for updating environment file.
     *
     * @param content new content for the environment file
     */
    public record EnvUpdateRequest(String content) {
    }

    /**
     * Update the environment file with new content.
     * Creates a backup before modifying.
     *
     * @param request the update request containing new content
     * @return JSON response indicating success or failure
     */
    @POST
    @RequireOrchestratorAuth
    @SecurityRequirement(name = "orchestratorAuth")
    @Operation(summary = "Update environment file content (creates backup)")
    @RequestBody(
            content = @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = EnvUpdateRequest.class)
            )
    )
    public Response updateEnvFile(EnvUpdateRequest request) {
        if (request == null || request.content() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Content is required"))
                    .build();
        }

        try {
            EnvFileUpdate update = envFileService.updateEnvFile(request.content());
            return Response.ok(Map.of(
                    "message", update.message(),
                    "backup", update.backupFilename()
            )).build();
        } catch (EnvFileException e) {
            return buildErrorResponse(e);
        }
    }

    /**
     * Builds an error response based on the exception type.
     *
     * @param exception the environment file exception
     * @return appropriate HTTP response
     */
    private Response buildErrorResponse(EnvFileException exception) {
        return switch (exception.getType()) {
            case NOT_FOUND -> Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", exception.getMessage()))
                    .build();
            case VALIDATION_ERROR -> Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", exception.getMessage()))
                    .build();
            case IO_ERROR -> Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", exception.getMessage()))
                    .build();
        };
    }
}
