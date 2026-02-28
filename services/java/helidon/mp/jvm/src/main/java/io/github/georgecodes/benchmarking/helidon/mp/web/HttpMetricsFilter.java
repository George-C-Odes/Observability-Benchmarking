package io.github.georgecodes.benchmarking.helidon.mp.web;

import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * JAX-RS filter that records Micrometer {@code http.server.requests}
 * Timer metrics for every request, matching the metric name used by
 * Spring Boot / Quarkus / Micronaut for consistency across benchmarks.
 * <p>
 * Tags: method, uri, status.
 * <p>
 * <b>Throughput optimisation:</b> Common HTTP status codes are pre-interned
 * to avoid {@code String.valueOf()} per request. Timers are lazily cached by
 * a {@link TimerKey} record so only the first request per method+uri+status
 * pays the registration cost.
 */
@Provider
public class HttpMetricsFilter implements ContainerRequestFilter, ContainerResponseFilter {

    /** RequestContext property name used to store the in-flight {@link Timer.Sample}. */
    private static final String SAMPLE_PROPERTY = "http.metrics.sample";

    /**
     * Tag value for this benchmark's single enabled endpoint ({@code /hello/virtual}).
     * Hardcoded to avoid {@code getUriInfo()} allocation on the hot path.
     * If multi-endpoint support is needed, replace with a dynamic lookup.
     */
    private static final String URI_TAG_VALUE = "/hello/virtual";

    /** Pre-interned status code strings (covers ~99 % of traffic). */
    private static final String[] STATUS_STRINGS = new String[600];
    static {
        for (int i = 100; i < STATUS_STRINGS.length; i++) {
            STATUS_STRINGS[i] = String.valueOf(i);
        }
    }

    /**
     * Type-safe composite key for the timer cache.
     *
     * @param method HTTP method (GET, POST, …)
     * @param uri    request path
     * @param status HTTP response status code
     */
    private record TimerKey(String method, String uri, String status) { }

    /** Whether HTTP metrics collection is enabled via config/environment. */
    private final boolean enabled;

    /** Cache of per-tag Timer instances to avoid per-request meter registration overhead. */
    private final ConcurrentMap<TimerKey, Timer> timers = new ConcurrentHashMap<>(16);

    @Inject
    public HttpMetricsFilter(
            @ConfigProperty(name = "HELIDON_MICROMETER_ENABLED", defaultValue = "true") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    public void filter(ContainerRequestContext requestContext) {
        if (!enabled) {
            return;
        }
        Timer.Sample sample = Timer.start(Metrics.globalRegistry);
        requestContext.setProperty(SAMPLE_PROPERTY, sample);
    }

    @Override
    public void filter(ContainerRequestContext requestContext, ContainerResponseContext responseContext) {
        if (!enabled) {
            return;
        }
        Object sampleObj = requestContext.getProperty(SAMPLE_PROPERTY);
        if (!(sampleObj instanceof Timer.Sample sample)) {
            return;
        }

        String method = requestContext.getMethod();
        String uri = URI_TAG_VALUE;
        int code = responseContext.getStatus();
        String status = (code >= 100 && code < STATUS_STRINGS.length)
                ? STATUS_STRINGS[code]
                : String.valueOf(code);

        var key = new TimerKey(method, uri, status);
        Timer timer = timers.computeIfAbsent(key, k ->
                Timer.builder("http.server.requests")
                        .description("HTTP server request duration")
                        .tag("method", k.method())
                        .tag("uri", k.uri())
                        .tag("status", k.status())
                        .register(Metrics.globalRegistry));

        sample.stop(timer);
    }
}