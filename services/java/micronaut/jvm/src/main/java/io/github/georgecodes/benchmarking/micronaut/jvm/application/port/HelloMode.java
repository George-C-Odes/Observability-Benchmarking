package io.github.georgecodes.benchmarking.micronaut.jvm.application.port;

public enum HelloMode {
    /** Platform threads (classic blocking endpoint). */
    PLATFORM("platform", "/hello/platform"),
    /** Virtual threads (blocking endpoint executed on the virtual-thread executor). */
    VIRTUAL("virtual", "/hello/virtual"),
    /** Virtual threads (non-blocking endpoint executed on event loop). */
    VIRTUAL_CARRIER("virtual-event-loop", "/hello/virtual-event-loop"),
    /** Reactive execution model (returns a Reactor Mono). */
    REACTIVE("reactive", "/hello/reactive");

    /** Human-readable mode label used in responses/logs. */
    private final String label;
    /** Endpoint tag used for metrics dimensions. */
    private final String endpointTag;

    HelloMode(String label, String endpointTag) {
        this.label = label;
        this.endpointTag = endpointTag;
    }

    public String label() {
        return label;
    }

    public String endpointTag() {
        return endpointTag;
    }
}