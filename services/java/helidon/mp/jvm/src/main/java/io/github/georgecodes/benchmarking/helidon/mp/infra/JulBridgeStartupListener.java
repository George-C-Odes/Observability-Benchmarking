package io.github.georgecodes.benchmarking.helidon.mp.infra;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Initialized;
import jakarta.enterprise.event.Observes;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.bridge.SLF4JBridgeHandler;

/**
 * CDI startup listener that routes JUL → SLF4J → Logback.
 * <p>
 * Separated from {@link StartupListener} so that logging-bridge
 * configuration has a single, focused reason to change.
 */
@Slf4j
@ApplicationScoped
public class JulBridgeStartupListener {

    void onStartup(@Observes @Initialized(ApplicationScoped.class) Object event) {
        SLF4JBridgeHandler.removeHandlersForRootLogger();
        SLF4JBridgeHandler.install();
        log.debug("JUL → SLF4J bridge installed");
    }
}