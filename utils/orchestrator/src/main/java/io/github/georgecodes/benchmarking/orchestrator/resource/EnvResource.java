package io.github.georgecodes.benchmarking.orchestrator.resource;

import io.github.georgecodes.benchmarking.orchestrator.security.RequireOrchestratorAuth;
import io.github.georgecodes.benchmarking.orchestrator.application.EnvFileService;
import io.github.georgecodes.benchmarking.orchestrator.application.EnvFileService.EnvFileContent;
import io.github.georgecodes.benchmarking.orchestrator.application.EnvFileService.EnvFileUpdate;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import lombok.RequiredArgsConstructor;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.RequestBody;
import org.eclipse.microprofile.openapi.annotations.security.SecurityRequirement;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

/**
 * REST resource for managing environment configuration files.
 * Provides endpoints for retrieving and updating the compose/.env file.
 * Delegates business logic to {@link EnvFileService}.
 */
@Path("/v1/env")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequiredArgsConstructor
@Tag(name = "Environment")
public class EnvResource {

    /** Service for environment file operations. */
    private final EnvFileService envFileService;

    /**
     * Get the content of the environment file.
     *
     * @return environment file content
     */
    @GET
    @Operation(summary = "Retrieve environment file content")
    public EnvFileContent getEnvFile() {
        return envFileService.readEnvFile();
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
     * @return update result with backup filename
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
    public EnvFileUpdate updateEnvFile(EnvUpdateRequest request) {
        if (request == null || request.content() == null) {
            throw new BadRequestException("Content is required");
        }
        return envFileService.updateEnvFile(request.content());
    }
}