package com.benchmarking.rest;

import com.benchmarking.security.RequireOrchestratorAuth;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.RequestBody;
import org.eclipse.microprofile.openapi.annotations.security.SecurityRequirement;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * REST resource for managing environment configuration files.
 * Provides endpoints for retrieving and updating the compose/.env file.
 */
@Path("/v1/env")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Environment")
public class EnvResource {

    private static final Logger LOG = Logger.getLogger(EnvResource.class);

    /**
     * Path to the environment configuration file.
     */
    @ConfigProperty(name = "orchestrator.env.path", defaultValue = "../compose/.env")
    String envFilePath;

    /**
     * Get the content of the environment file.
     *
     * @return JSON response containing the file content
     */
    @GET
    @Operation(summary = "Retrieve environment file content")
    public Response getEnvFile() {
        try {
            Path path = Paths.get(envFilePath);
            if (!Files.exists(path)) {
                LOG.warnf("Environment file not found at: %s", path.toAbsolutePath());
                return Response.status(Response.Status.NOT_FOUND)
                        .entity(Map.of("error", "Environment file not found"))
                        .build();
            }

            String content = Files.readString(path);
            LOG.infof("Successfully read environment file from: %s", path.toAbsolutePath());
            
            return Response.ok(Map.of("content", content, "path", path.toAbsolutePath().toString())).build();
        } catch (IOException e) {
            LOG.errorf(e, "Failed to read environment file: %s", envFilePath);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to read environment file: " + e.getMessage()))
                    .build();
        }
    }

    /**
     * Request body for updating environment file.
     */
    public static class EnvUpdateRequest {
        /**
         * New content for the environment file.
         */
        public String content;
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
        if (request == null || request.content == null || request.content.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Content is required"))
                    .build();
        }

        try {
            Path path = Paths.get(envFilePath);
            
            if (!Files.exists(path)) {
                LOG.warnf("Environment file not found at: %s", path.toAbsolutePath());
                return Response.status(Response.Status.NOT_FOUND)
                        .entity(Map.of("error", "Environment file not found"))
                        .build();
            }

            // Create backup
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
            Path backupPath = path.resolveSibling(path.getFileName() + ".backup." + timestamp);
            Files.copy(path, backupPath, StandardCopyOption.REPLACE_EXISTING);
            LOG.infof("Created backup: %s", backupPath.toAbsolutePath());

            // Write new content
            Files.writeString(path, request.content);
            LOG.infof("Successfully updated environment file: %s", path.toAbsolutePath());

            return Response.ok(Map.of(
                    "message", "Environment file updated successfully",
                    "backup", backupPath.getFileName().toString()
            )).build();
        } catch (IOException e) {
            LOG.errorf(e, "Failed to update environment file: %s", envFilePath);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to update environment file: " + e.getMessage()))
                    .build();
        }
    }
}
