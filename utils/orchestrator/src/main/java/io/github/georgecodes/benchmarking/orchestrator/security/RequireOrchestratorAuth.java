package io.github.georgecodes.benchmarking.orchestrator.security;

import jakarta.ws.rs.NameBinding;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Name-binding annotation that marks JAX-RS resources requiring orchestrator authentication. */
@NameBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface RequireOrchestratorAuth {}
