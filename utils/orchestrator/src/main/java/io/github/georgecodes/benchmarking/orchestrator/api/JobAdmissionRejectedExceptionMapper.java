package io.github.georgecodes.benchmarking.orchestrator.api;

import io.github.georgecodes.benchmarking.orchestrator.application.job.JobAdmissionRejectedException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

/** Maps rejected job submissions from the application layer to HTTP 503 responses. */
@Provider
public class JobAdmissionRejectedExceptionMapper
    implements ExceptionMapper<JobAdmissionRejectedException> {

  /**
   * Converts a job-admission rejection into a JSON API error response.
   *
   * @param exception the application-layer admission exception
   * @return HTTP 503 with a stable error payload
   */
  @Override
  public Response toResponse(JobAdmissionRejectedException exception) {
    return Response.status(Response.Status.SERVICE_UNAVAILABLE)
        .entity(new ErrorResponse("orchestrator_busy", exception.getMessage()))
        .build();
  }
}
