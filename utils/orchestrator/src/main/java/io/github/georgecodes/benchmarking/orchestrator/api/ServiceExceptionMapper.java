package io.github.georgecodes.benchmarking.orchestrator.api;

import io.github.georgecodes.benchmarking.orchestrator.application.ServiceException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import java.util.Locale;

/**
 * Maps every {@link ServiceException} subclass to the correct HTTP status.
 *
 * <p>Because both {@code EnvFileException} and {@code BenchmarkTargetsException} extend {@code
 * ServiceException} and share the same {@link ServiceException.Type} enum, a single mapper
 * eliminates the duplicated translation logic that previously lived in two separate mapper classes.
 */
@Provider
public class ServiceExceptionMapper implements ExceptionMapper<ServiceException> {

  /**
   * Converts a {@link ServiceException} into the corresponding HTTP error response.
   *
   * @param e the service exception to map
   * @return the HTTP response derived from the exception type
   */
  @Override
  public Response toResponse(ServiceException e) {
    Response.Status httpStatus =
        switch (e.getType()) {
          case NOT_FOUND -> Response.Status.NOT_FOUND;
          case VALIDATION_ERROR -> Response.Status.BAD_REQUEST;
          case IO_ERROR -> Response.Status.INTERNAL_SERVER_ERROR;
        };

    return Response.status(httpStatus)
        .entity(new ErrorResponse(e.getType().name().toLowerCase(Locale.ROOT), e.getMessage()))
        .build();
  }
}
