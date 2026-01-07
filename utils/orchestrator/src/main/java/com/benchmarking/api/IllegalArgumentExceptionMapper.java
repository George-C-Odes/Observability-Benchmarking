package com.benchmarking.api;

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
     */
    public static class ErrorResponse {
        /**
         * Error type identifier.
         */
        private String error;
        
        /**
         * Detailed error message.
         */
        private String message;

        /**
         * Creates a new error response.
         *
         * @param error the error type
         * @param message the error message
         */
        public ErrorResponse(String error, String message) {
            this.error = error;
            this.message = message;
        }

        /**
         * Gets the error type.
         *
         * @return the error type
         */
        public String getError() {
            return error;
        }

        /**
         * Gets the error message.
         *
         * @return the error message
         */
        public String getMessage() {
            return message;
        }
    }
}
