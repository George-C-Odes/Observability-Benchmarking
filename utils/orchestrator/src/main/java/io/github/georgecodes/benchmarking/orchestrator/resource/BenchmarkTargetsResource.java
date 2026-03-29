package io.github.georgecodes.benchmarking.orchestrator.resource;

import io.github.georgecodes.benchmarking.orchestrator.application.BenchmarkTargetsService;
import io.github.georgecodes.benchmarking.orchestrator.application.BenchmarkTargetsService.BenchmarkTargetsContent;
import io.github.georgecodes.benchmarking.orchestrator.application.BenchmarkTargetsService.BenchmarkTargetsUpdate;
import io.github.georgecodes.benchmarking.orchestrator.security.RequireOrchestratorAuth;
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

import java.util.List;

/**
 * REST resource for managing benchmark target URLs.
 * Provides endpoints for retrieving and updating the {@code config/benchmark-targets.txt} file.
 * Delegates business logic to {@link BenchmarkTargetsService}.
 */
@Path("/v1/benchmark-targets")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequiredArgsConstructor
@Tag(name = "Benchmark Targets")
public class BenchmarkTargetsResource {

    private final BenchmarkTargetsService benchmarkTargetsService;

    /**
     * Get the current list of benchmark target URLs.
     *
     * @return benchmark targets content (URLs and file path)
     */
    @GET
    @Operation(summary = "Retrieve benchmark target URLs")
    public BenchmarkTargetsContent getTargets() {
        return benchmarkTargetsService.readTargets();
    }

    /**
     * Request body for updating benchmark targets.
     *
     * @param urls the new list of benchmark target URLs
     */
    public record BenchmarkTargetsUpdateRequest(List<String> urls) {}

    /**
     * Update the benchmark targets file with a new URL list.
     * Creates a backup before modifying.
     *
     * @param request the update request containing the new URL list
     * @return update the result with a backup filename
     */
    @POST
    @RequireOrchestratorAuth
    @SecurityRequirement(name = "orchestratorAuth")
    @Operation(summary = "Update benchmark target URLs (creates backup)")
    @RequestBody(
            content = @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = BenchmarkTargetsUpdateRequest.class)
            )
    )
    public BenchmarkTargetsUpdate updateTargets(BenchmarkTargetsUpdateRequest request) {
        if (request == null || request.urls() == null) {
            throw new BadRequestException("urls list is required");
        }
        return benchmarkTargetsService.updateTargets(request.urls());
    }
}