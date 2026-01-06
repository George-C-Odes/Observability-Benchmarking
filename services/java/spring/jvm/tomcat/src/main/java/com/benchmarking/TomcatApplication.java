package com.benchmarking;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot application entry point for Tomcat-based REST service.
 * Provides a traditional servlet-based web server using Tomcat.
 */
@SpringBootApplication
public class TomcatApplication {

    /**
     * Main method to start the Spring Boot application.
     *
     * @param args command-line arguments
     */
    static void main(String[] args) {
        SpringApplication.run(TomcatApplication.class, args);
    }
}
