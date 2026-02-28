package io.github.georgecodes.benchmarking.micronaut;

import io.micronaut.runtime.Micronaut;

public final class MicronautApplication {

    private MicronautApplication() {
    }

    static void main(String[] args) {
        Micronaut.run(MicronautApplication.class, args);
    }
}