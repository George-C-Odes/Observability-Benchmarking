package io.github.georgecodes.benchmarking.orchestrator.api;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

@Provider
public class IllegalArgumentExceptionMapper implements ExceptionMapper<IllegalArgumentException> {
    @Override
    public Response toResponse(IllegalArgumentException e) {
        return Response.status(Response.Status.BAD_REQUEST)
                .entity(new ErrorResponse("bad_request", e.getMessage()))
                .build();
    }

    /**
     * Error response structure for bad requests.
     *
     * @param error error type identifier
     * @param message detailed error message
     */
    public record ErrorResponse(String error, String message) {
    }
}
