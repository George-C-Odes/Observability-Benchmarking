package io.github.georgecodes.benchmarking.orchestrator.security;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.MDC;

import java.util.UUID;

/**
 * Ensures every request handled by the orchestrator has a correlation id.
 *
 * <p>We prefer an incoming {@code X-Request-Id} from upstream (e.g. nextjs-dash), but
 * we generate a UUID when absent.
 *
 * <p>The value is stored in MDC under key {@code requestId} so it can:
 * <ul>
 *   <li>appear in orchestrator logs</li>
 *   <li>be embedded into {@link io.github.georgecodes.benchmarking.orchestrator.api.JobEvent} payloads</li>
 * </ul>
 */
@Provider
@Priority(Priorities.HEADER_DECORATOR)
@ApplicationScoped
public class RequestIdFilter implements ContainerRequestFilter {

  @Override
  public void filter(ContainerRequestContext ctx) {
    String incoming = ctx.getHeaderString("X-Request-Id");
    String requestId = (incoming != null && !incoming.isBlank()) ? incoming : UUID.randomUUID().toString();
    MDC.put("requestId", requestId);
  }
}