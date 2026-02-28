package io.github.georgecodes.benchmarking.helidon.mp.web;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ApplicationPath;
import jakarta.ws.rs.core.Application;

/**
 * JAX-RS application root. Maps all resources under {@code /}.
 */
@ApplicationScoped
@ApplicationPath("/")
public class HelloApplication extends Application {
}