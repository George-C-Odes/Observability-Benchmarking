package com.benchmarking;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot application entry point for Netty-based REST service.
 * Provides a reactive web server using Netty for high-performance HTTP handling.
 */
@SpringBootApplication
public class NettyApplication {

    /**
     * Main method to start the Spring Boot application.
     *
     * @param args command-line arguments
     */
    static void main(String[] args) {
        SpringApplication.run(NettyApplication.class, args);
    }
}
