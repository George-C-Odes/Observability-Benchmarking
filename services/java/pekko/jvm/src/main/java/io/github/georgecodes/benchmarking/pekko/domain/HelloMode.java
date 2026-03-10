package io.github.georgecodes.benchmarking.pekko.domain;

/**
 * Identifies the reactive endpoint mode, used for metrics tagging and response formatting.
 *
 * @param label          human-readable label
 * @param endpointTag    stable tag value for metrics
 * @param responsePrefix pre-computed response prefix
 */
public record HelloMode(String label, String endpointTag, String responsePrefix) {

    /** The single reactive mode for Pekko benchmarking. */
    public static final HelloMode REACTIVE = new HelloMode(
        "reactive",
        "/hello/reactive",
        "Hello from Pekko reactive REST "
    );
}