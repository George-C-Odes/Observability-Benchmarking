package io.github.georgecodes.benchmarking.pekko.web;

import io.github.georgecodes.benchmarking.pekko.domain.HelloMode;
import io.github.georgecodes.benchmarking.pekko.domain.HelloService;
import io.github.georgecodes.benchmarking.pekko.infra.MetricsProvider;
import org.apache.pekko.actor.ActorSystem;
import org.apache.pekko.http.javadsl.model.ContentTypes;
import org.apache.pekko.http.javadsl.model.HttpResponse;
import org.apache.pekko.http.javadsl.model.StatusCodes;
import org.apache.pekko.http.javadsl.server.AllDirectives;
import org.apache.pekko.http.javadsl.server.Route;
import org.apache.pekko.util.ByteString;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Pekko HTTP routes for the reactive hello endpoint.
 *
 * <p>All handler code runs directly on the Pekko HTTP dispatcher threads
 * (non-blocking). Blocking sleep for benchmarking is dispatched via the
 * Pekko scheduler to avoid blocking the dispatcher.
 */
public final class HelloRoutes extends AllDirectives {

    /** Logger for request/thread debug output. */
    private static final Logger LOG = LoggerFactory.getLogger(HelloRoutes.class);

    /** Pre-built readiness response — allocated once, reused on every probe. */
    private static final HttpResponse READY_RESPONSE = HttpResponse.create()
        .withStatus(StatusCodes.OK)
        .withEntity(ContentTypes.TEXT_PLAIN_UTF8, "UP");

    /** Pure domain logic for hello responses. */
    private final HelloService helloService;

    /** Metrics for the reactive endpoint. */
    private final MetricsProvider metricsProvider;

    /** Pekko actor system for scheduler-based non-blocking sleep. */
    private final ActorSystem actorSystem;

    public HelloRoutes(HelloService helloService,
                       MetricsProvider metricsProvider,
                       ActorSystem actorSystem) {
        this.helloService = Objects.requireNonNull(helloService, "helloService");
        this.metricsProvider = Objects.requireNonNull(metricsProvider, "metricsProvider");
        this.actorSystem = Objects.requireNonNull(actorSystem, "actorSystem");
    }

    /**
     * Builds the complete route tree for this service.
     */
    public Route routes() {
        return concat(
            pathPrefix("hello", () ->
                path("reactive", () ->
                    get(this::handleReactive)
                )
            ),
            path("ready", () ->
                get(() -> complete(READY_RESPONSE))
            )
        );
    }

    private Route handleReactive() {
        return parameterOptional("sleep", sleepOpt ->
            parameterOptional("log", logOpt -> {
                metricsProvider.incrementReactive();

                boolean printLog = logOpt.map(Boolean::parseBoolean).orElse(false);
                if (printLog) {
                    var currentThread = Thread.currentThread();
                    LOG.info("reactive thread: '{}', isVirtual: '{}'",
                        currentThread, currentThread.isVirtual());
                }

                int sleepSeconds = sleepOpt.flatMap(HelloRoutes::parseOptionalInt).orElse(0);

                if (sleepSeconds > 0) {
                    CompletableFuture<HttpResponse> future = new CompletableFuture<>();
                    actorSystem.scheduler().scheduleOnce(
                        scala.concurrent.duration.Duration.create(sleepSeconds, TimeUnit.SECONDS),
                        () -> future.complete(buildJsonResponse()),
                        actorSystem.dispatcher()
                    );
                    return completeWithFuture(future);
                }

                return complete(buildJsonResponse());
            })
        );
    }

    /**
     * Builds the JSON response — calls the domain service on every request,
     * which performs a Caffeine cache lookup (consistent with all other modules).
     */
    private HttpResponse buildJsonResponse() {
        String body = "\"" + helloService.handle(HelloMode.REACTIVE) + "\"";
        return HttpResponse.create()
            .withStatus(StatusCodes.OK)
            .withEntity(ContentTypes.APPLICATION_JSON, ByteString.fromString(body));
    }

    private static Optional<Integer> parseOptionalInt(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(Integer.parseInt(value.trim()));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }
}