package io.github.georgecodes.benchmarking.helidon.se.application.port;

/**
 * Helidon 4 is virtual-thread–first.
 * Only the VIRTUAL mode is implemented for benchmarking.
 */
public enum HelloMode {
    /** Virtual threads (Helidon 4 default — every request runs on a virtual thread). */
    VIRTUAL("virtual", "/hello/virtual");

    /** Human-readable mode label used in responses/logs. */
    private final String label;
    /** Endpoint tag used for metrics dimensions. */
    private final String endpointTag;
    /** Pre-computed response prefix (avoids per-request string concatenation). */
    private final String responsePrefix;

    HelloMode(String label, String endpointTag) {
        this.label = label;
        this.endpointTag = endpointTag;
        this.responsePrefix = "Hello from Helidon SE " + label + " REST ";
    }

    public String label() {
        return label;
    }

    public String endpointTag() {
        return endpointTag;
    }

    public String responsePrefix() {
        return responsePrefix;
    }
}