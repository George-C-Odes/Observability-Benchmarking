package io.github.georgecodes.benchmarking.quarkus.application.port;

/**
 * Identifies endpoint semantics in a way that's stable for metrics.
 */
public enum HelloMode {

    /** Platform thread endpoint. */
    PLATFORM("platform", "/hello/platform"),

    /** Virtual thread endpoint. */
    VIRTUAL("virtual", "/hello/virtual"),

    /** Reactive endpoint. */
    REACTIVE("reactive", "/hello/reactive");

    /** Human-readable label used in the response payload. */
    private final String label;

    /** Stable endpoint tag value used for metrics. */
    private final String endpointTag;

    /** Stable response prefix used by {@code HelloService} to avoid repeated concatenation. */
    private final String responsePrefix;

    HelloMode(String label, String endpointTag) {
        this.label = label;
        this.endpointTag = endpointTag;
        this.responsePrefix = "Hello from Quarkus " + label + " REST ";
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