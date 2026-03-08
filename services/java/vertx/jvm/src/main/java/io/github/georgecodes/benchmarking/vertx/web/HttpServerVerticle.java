package io.github.georgecodes.benchmarking.vertx.web;

import io.github.georgecodes.benchmarking.vertx.domain.HelloService;
import io.github.georgecodes.benchmarking.vertx.infra.MetricsProvider;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Promise;
import io.vertx.core.http.HttpServerOptions;
import io.vertx.ext.web.Router;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;

/**
 * HTTP server verticle — each deployed instance runs on its own event-loop
 * thread, owns its own {@link Router} and {@link io.vertx.core.http.HttpServer}.
 *
 * <p>Deploying N instances with {@code DeploymentOptions.setInstances(N)}
 * distributes accept + request processing across N event-loop threads,
 * which is the idiomatic Vert.x way to utilise multiple CPU cores.
 */
public final class HttpServerVerticle extends AbstractVerticle {

    /** Logger for server lifecycle events. */
    private static final Logger LOG = LoggerFactory.getLogger(HttpServerVerticle.class);

    /** Listening port for this server instance. */
    private final int port;

    /** Domain service for hello response generation. */
    private final HelloService helloService;

    /** Metrics provider for the reactive endpoint counter. */
    private final MetricsProvider metricsProvider;

    /** Pre-configured HTTP server options (shared across verticle instances). */
    private final HttpServerOptions serverOptions;

    public HttpServerVerticle(int port,
                              HelloService helloService,
                              MetricsProvider metricsProvider,
                              HttpServerOptions serverOptions) {
        this.port = port;
        this.helloService = Objects.requireNonNull(helloService, "helloService");
        this.metricsProvider = Objects.requireNonNull(metricsProvider, "metricsProvider");
        this.serverOptions = Objects.requireNonNull(serverOptions, "serverOptions");
    }

    @Override
    public void start(Promise<Void> startPromise) {
        // Each verticle instance creates its own Router — no cross-thread sharing.
        Router router = Router.router(vertx);
        HelloRoutes helloRoutes = new HelloRoutes(helloService, metricsProvider);
        helloRoutes.register(router, vertx);

        vertx.createHttpServer(serverOptions)
            .requestHandler(router)
            .listen(port)
            .onSuccess(server -> {
                LOG.info("Vert.x HTTP server verticle listening on port {} (event-loop: {})",
                    server.actualPort(), Thread.currentThread().getName());
                startPromise.complete();
            })
            .onFailure(err -> {
                LOG.error("Failed to start Vert.x HTTP server verticle", err);
                startPromise.fail(err);
            });
    }
}