package io.github.georgecodes.benchmarking.micronaut;

import io.micronaut.runtime.Micronaut;
import org.slf4j.bridge.SLF4JBridgeHandler;

public final class MicronautApplication {

    private MicronautApplication() {
    }

    static void main(String[] args) {
        installJulBridge();
        Micronaut.run(MicronautApplication.class, args);
    }

    private static void installJulBridge() {
        SLF4JBridgeHandler.removeHandlersForRootLogger();
        if (!SLF4JBridgeHandler.isInstalled()) {
            SLF4JBridgeHandler.install();
        }
    }
}