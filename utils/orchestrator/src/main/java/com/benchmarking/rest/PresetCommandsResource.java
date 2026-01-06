package com.benchmarking.rest;

import com.benchmarking.api.CommandPreset;
import com.benchmarking.core.RunPresetService;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.List;

@Path("/v1/commands")
@Produces(MediaType.APPLICATION_JSON)
@Tag(name = "Presets")
public class PresetCommandsResource {

  @Inject
  RunPresetService presets;

  @GET
  @Operation(summary = "List preconfigured Docker commands discovered from IntelliJ .run XML files")
  @APIResponse(responseCode = "200", description = "Array of discovered commands")
  public List<CommandPreset> list() {
    return presets.listPresets();
  }
}
