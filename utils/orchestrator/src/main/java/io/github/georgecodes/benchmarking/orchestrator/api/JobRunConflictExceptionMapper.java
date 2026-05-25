package io.github.georgecodes.benchmarking.orchestrator.api;

import io.github.georgecodes.benchmarking.orchestrator.application.job.JobRunConflictException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

/** Maps job/run correlation conflicts from the application layer to HTTP 409 responses. */
@Provider
public class JobRunConflictExceptionMapper implements ExceptionMapper<JobRunConflictException> {

  /**
   * Converts a job/run conflict into a JSON API error response.
   *
   * @param exception the application-layer conflict exception
   * @return HTTP 409 with a stable error payload
   */
  @Override
  public Response toResponse(JobRunConflictException exception) {
    return Response.status(Response.Status.CONFLICT)
        .entity(new ErrorResponse(exception.errorCode(), exception.getMessage()))
        .build();
  }
}
