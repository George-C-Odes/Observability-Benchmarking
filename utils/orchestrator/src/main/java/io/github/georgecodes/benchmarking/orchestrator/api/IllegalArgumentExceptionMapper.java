package io.github.georgecodes.benchmarking.orchestrator.api;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

/** Maps {@link IllegalArgumentException} to a {@code 400 Bad Request} response. */
@Provider
public class IllegalArgumentExceptionMapper implements ExceptionMapper<IllegalArgumentException> {
  /**
   * Converts an {@link IllegalArgumentException} into a {@code 400 Bad Request} response.
   *
   * @param e the exception to map
   * @return the HTTP response describing the validation error
   */
  @Override
  public Response toResponse(IllegalArgumentException e) {
    return Response.status(Response.Status.BAD_REQUEST)
        .entity(new ErrorResponse("bad_request", e.getMessage()))
        .build();
  }
}
