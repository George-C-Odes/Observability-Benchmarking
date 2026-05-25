package io.github.georgecodes.benchmarking.orchestrator.security;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;
import java.util.UUID;
import org.jboss.logging.MDC;

/**
 * Ensures every request handled by the orchestrator has a correlation id.
 *
 * <p>We prefer an incoming {@code X-Request-Id} from upstream (e.g., nextjs-dash), but we generate
 * a UUID when absent.
 *
 * <p>The value is stored in MDC under key {@code requestId} so it can:
 *
 * <ul>
 *   <li>appear in orchestrator logs
 *   <li>be embedded into {@link io.github.georgecodes.benchmarking.orchestrator.api.JobEvent}
 *       payloads
 * </ul>
 */
@Provider
@Priority(Priorities.HEADER_DECORATOR)
@ApplicationScoped
public class RequestIdFilter implements ContainerRequestFilter, ContainerResponseFilter {

  /** Header used to propagate request correlation identifiers. */
  public static final String REQUEST_ID_HEADER = "X-Request-Id";

  /** Request-context property used to carry the request id to the response filter. */
  private static final String REQUEST_ID_PROPERTY = RequestIdFilter.class.getName() + ".requestId";

  /**
   * Ensures the current request has a request id stored in MDC.
   *
   * @param ctx the current request context
   */
  @Override
  public void filter(ContainerRequestContext ctx) {
    String incoming = ctx.getHeaderString(REQUEST_ID_HEADER);
    String requestId =
        (incoming != null && !incoming.isBlank()) ? incoming : UUID.randomUUID().toString();
    ctx.setProperty(REQUEST_ID_PROPERTY, requestId);
    MDC.put("requestId", requestId);
  }

  /**
   * Adds the request id to the response and clears request-scoped MDC state.
   *
   * @param requestContext the request context
   * @param responseContext the response context
   */
  @Override
  public void filter(
      ContainerRequestContext requestContext, ContainerResponseContext responseContext) {
    Object requestId = requestContext.getProperty(REQUEST_ID_PROPERTY);
    if (requestId != null) {
      responseContext.getHeaders().putSingle(REQUEST_ID_HEADER, requestId);
    }
    MDC.remove("requestId");
  }
}
