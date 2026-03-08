package io.github.georgecodes.benchmarking.orchestrator.api;

import io.github.georgecodes.benchmarking.orchestrator.application.EnvFileService.EnvFileException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.util.Map;

/**
 * Maps {@link EnvFileException} to appropriate HTTP responses.
 */
@Provider
public class EnvFileExceptionMapper implements ExceptionMapper<EnvFileException> {

  @Override
  public Response toResponse(EnvFileException e) {
    Response.Status httpStatus = switch (e.getType()) {
      case NOT_FOUND -> Response.Status.NOT_FOUND;
      case VALIDATION_ERROR -> Response.Status.BAD_REQUEST;
      case IO_ERROR -> Response.Status.INTERNAL_SERVER_ERROR;
    };

    return Response.status(httpStatus)
      .entity(Map.of("error", e.getMessage()))
      .build();
  }
}