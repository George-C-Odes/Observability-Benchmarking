package io.github.georgecodes.benchmarking.orchestrator.security;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@Provider
@RequireOrchestratorAuth
@Priority(Priorities.AUTHENTICATION)
@ApplicationScoped
public class BearerAuthFilter implements ContainerRequestFilter {

  /**
   * API key for bearer token authentication.
   */
  @ConfigProperty(name = "orchestrator.api-key")
  String apiKey;

  @Override
  public void filter(ContainerRequestContext ctx) {
    // If no API key configured, allow (local dev convenience)
    if (apiKey == null || apiKey.isBlank()) {
      return;
    }

    String auth = ctx.getHeaderString("Authorization");
    if (auth == null || !auth.startsWith("Bearer ")) {
      ctx.abortWith(Response.status(Response.Status.UNAUTHORIZED).entity("Missing bearer token").build());
      return;
    }
    String token = auth.substring("Bearer ".length()).trim();
    if (!apiKey.equals(token)) {
      ctx.abortWith(Response.status(Response.Status.FORBIDDEN).entity("Invalid token").build());
    }
  }
}
