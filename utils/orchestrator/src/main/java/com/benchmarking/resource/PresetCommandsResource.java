package com.benchmarking.resource;

import com.benchmarking.api.CommandPreset;
import com.benchmarking.application.RunPresetService;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.List;

/**
 * REST resource for listing preset commands.
 * Delegates business logic to {@link RunPresetService}.
 */
@Path("/v1/commands")
@Produces(MediaType.APPLICATION_JSON)
@Tag(name = "Presets")
public class PresetCommandsResource {

  /**
   * Service for discovering and listing preset commands.
   */
  @Inject
  RunPresetService presets;

  /**
   * Lists all preconfigured Docker commands discovered from IntelliJ .run XML files.
   *
   * @return list of discovered command presets
   */
  @GET
  @Operation(summary = "List preconfigured Docker commands discovered from IntelliJ .run XML files")
  @APIResponse(responseCode = "200", description = "Array of discovered commands")
  public List<CommandPreset> list() {
    return presets.listPresets();
  }
}
