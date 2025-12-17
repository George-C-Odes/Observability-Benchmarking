package com.benchmarking;

import io.micronaut.runtime.Micronaut;

/**
 * Main entry point for the Micronaut benchmark service.
 * Configures and starts the Micronaut application.
 */
public class Application {

    /**
     * Main method to start the Micronaut application.
     *
     * @param args command line arguments
     */
    public static void main(String[] args) {
        Micronaut.run(Application.class, args);
    }
}
