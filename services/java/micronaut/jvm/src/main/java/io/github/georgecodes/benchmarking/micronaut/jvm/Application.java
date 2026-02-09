package io.github.georgecodes.benchmarking.micronaut.jvm;

import io.micronaut.runtime.Micronaut;

public final class Application {

    private Application() {
    }

    static void main(String[] args) {
        Micronaut.run(Application.class, args);
    }
}