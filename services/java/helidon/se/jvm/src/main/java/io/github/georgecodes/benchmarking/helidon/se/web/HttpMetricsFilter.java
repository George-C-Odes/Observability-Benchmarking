package io.github.georgecodes.benchmarking.helidon.se.web;

import io.helidon.webserver.http.Filter;
import io.helidon.webserver.http.FilterChain;
import io.helidon.webserver.http.RoutingRequest;
import io.helidon.webserver.http.RoutingResponse;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Helidon SE HTTP filter that records Micrometer {@code http.server.requests}
 * Timer metrics for every request, matching the metric name used by
 * Spring Boot / Quarkus / Micronaut for consistency across benchmarks.
 * <p>
 * Tags:
 * <ul>
 *   <li>{@code method}  – HTTP method (GET, POST, …)</li>
 *   <li>{@code uri}     – request path</li>
 *   <li>{@code status}  – HTTP response status code</li>
 * </ul>
 * <p>
 * <b>Throughput optimisation:</b> Common HTTP status codes are pre-interned
 * to avoid {@code String.valueOf()} per request. Timers are lazily cached by
 * a {@link TimerKey} record so only the first request per method+uri+status
 * pays the registration cost.
 */
public final class HttpMetricsFilter implements Filter {

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

    /** Cache of pre-registered Timers keyed by method+uri+status. */
    private final ConcurrentMap<TimerKey, Timer> timers = new ConcurrentHashMap<>(16);

    @Override
    public void filter(FilterChain chain, RoutingRequest req, RoutingResponse res) {
        Timer.Sample sample = Timer.start(Metrics.globalRegistry);

        try {
            chain.proceed();
        } finally {
            String method = req.prologue().method().text();
            String uri = req.path().path();
            int code = res.status().code();
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
}