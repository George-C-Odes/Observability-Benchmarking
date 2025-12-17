# Services

This directory contains the REST service implementations used for benchmarking.

## Available Services

### Java Services (JDK 25)

#### Spring Boot 4.0.0
- **Location**: `services/spring/`
- **Variants**: JVM (Tomcat, Netty), Native (Tomcat, Netty)
- **Thread Models**: Platform, Virtual, Reactive
- **Description**: Industry-standard Spring Boot framework with comprehensive ecosystem

#### Quarkus 3.30.3
- **Location**: `services/quarkus/`
- **Variants**: JVM, Native
- **Thread Models**: Platform, Virtual, Reactive (all in one deployment)
- **Description**: Kubernetes-native Java framework optimized for GraalVM and HotSpot

#### Helidon 4.3.2
- **Location**: `services/helidon/`
- **Variants**: JVM
- **Thread Models**: Platform, Virtual, Reactive
- **Description**: Oracle's lightweight microservices framework with reactive core

#### Micronaut 4.10.5
- **Location**: `services/micronaut/`
- **Variants**: JVM
- **Thread Models**: Platform, Virtual, Reactive
- **Description**: Modern JVM framework with compile-time dependency injection and AOT optimizations

### Go Services

#### Go 1.25.5 (Work in Progress)
- **Location**: `services/go/`
- **Framework**: Fiber
- **Description**: High-performance Go web framework with Express-inspired API

## Naming & Expectations

- Each service should have its own subdirectory (e.g., `quarkus/jvm/`, `spring/jvm/netty/`)
- Include a Dockerfile in each service directory
- Include a README describing the service, thread model, and any special configuration
- Services should expose port 8080 internally (mapped to different external ports via docker-compose)

## Common Endpoints

All Java services implement the following endpoints:

- `GET /hello/platform` - Platform threads endpoint
- `GET /hello/virtual` - Virtual threads endpoint (Java 21+)
- `GET /hello/reactive` - Reactive/async endpoint
- Health checks at framework-specific paths:
  - Spring: `/actuator/health`
  - Quarkus: `/q/health`
  - Helidon: `/observe/health`
  - Micronaut: `/health`

## Useful Docker commands

Native builder image pull from Oracle Enterprise:
  ```bash
docker pull container-registry.oracle.com/graalvm/native-image:25.0.1-ol10
  ```

Native builder image pull from GraalVM community:
  ```bash
docker pull ghcr.io/graalvm/native-image-community:25.0.1-ol10
  ```