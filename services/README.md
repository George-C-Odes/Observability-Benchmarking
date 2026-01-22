# Services

This directory contains the REST service implementations used for benchmarking.

## Naming & Expectations

- Framework categorizes services as subdirectories
- Include a Dockerfile in each service directory
- Include a README describing the service, thread model, and any special configuration
- Services should expose a configurable port via `SERVICE_PORT` environment variable

## Useful Docker commands
### Base Image Builders
Native builder image pull from Oracle Enterprise:
  ```bash
docker pull container-registry.oracle.com/graalvm/native-image:25.0.1-ol10
  ```
Native builder image pull from GraalVM community:
  ```bash
docker pull ghcr.io/graalvm/native-image-community:25.0.1-ol10
  ```

### Service Image Builders
*This is pretty much the same as running in IntelliJ the Docker scripts prefixed with '[build-img]' which are under the '.run' directory.*

Run from the project root directory.

**spring-jvm-tomcat-platform**
```powershell
docker buildx build `
  -f services/java/spring/jvm/Dockerfile `
  -t spring-jvm-tomcat-platform:4.0.1_latest `
  --build-arg PROFILE=tomcat `
  --build-arg SPRING_BOOT_VERSION=4.0.1 `
  --build-arg BUILDKIT_BUILD_NAME=spring-jvm-tomcat-platform:4.0.1_latest `
  --load `
  services/java
```
**spring-jvm-tomcat-virtual**
```powershell
docker buildx build `
    -f services/java/spring/jvm/Dockerfile `
    -t spring-jvm-tomcat-virtual:4.0.1_latest `
    --build-arg PROFILE=tomcat `
    --build-arg SPRING_BOOT_VERSION=4.0.1 `
    --build-arg BUILDKIT_BUILD_NAME=spring-jvm-tomcat-virtual:4.0.1_latest `
    --load `
    services/java
```
**spring-jvm-netty**
```powershell
docker buildx build `
  -f services/java/spring/jvm/Dockerfile `
  -t spring-jvm-netty:4.0.1_latest `
  --build-arg PROFILE=netty `
  --build-arg SPRING_BOOT_VERSION=4.0.1 `
  --build-arg BUILDKIT_BUILD_NAME=spring-jvm-netty:4.0.1_latest `
  --load `
  services/java
```
**spring-native-tomcat-platform**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-tomcat-platform:4.0.1_latest `
  --build-arg PROFILE=tomcat `
  --build-arg VIRTUAL_ENABLED=false `
  --build-arg SPRING_BOOT_VERSION=4.0.1 `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-tomcat-platform:4.0.1_latest `
  --load `
  services/java
```
**spring-native-tomcat-virtual**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-tomcat-virtual:4.0.1_latest `
  --build-arg PROFILE=tomcat `
  --build-arg VIRTUAL_ENABLED=true `
  --build-arg SPRING_BOOT_VERSION=4.0.1 `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-tomcat-virtual:4.0.1_latest `
  --load `
  services/java
```
**spring-native-netty**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-netty:4.0.1_latest `
  --build-arg PROFILE=netty `
  --build-arg VIRTUAL_ENABLED=false `
  --build-arg SPRING_BOOT_VERSION=4.0.1 `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-netty:4.0.1_latest `
  --load `
  services/java
```
**quarkus-jvm**
```powershell
docker buildx build `
  -f services/java/quarkus/jvm/Dockerfile `
  -t quarkus-jvm:3.30.7_latest `
  --build-arg QUARKUS_VERSION=3.30.7 `
  --build-arg BUILDKIT_BUILD_NAME=quarkus-jvm:3.30.7_latest `
  --load `
  services/java
```
**quarkus-native**
```powershell
docker buildx build `
    -f services/java/quarkus/native/Dockerfile `
    -t quarkus-native:3.30.7_latest `
    --build-arg QUARKUS_VERSION=3.30.7 `
    --build-arg BUILDKIT_BUILD_NAME=quarkus-native:3.30.7_latest `
    --load `
    services/java
```
**go**
```powershell
docker buildx build `
    -f services/go/enhanced/Dockerfile `
    -t go:1.25.6_latest `
    --build-arg GO_VERSION=1.25.6 `
    --build-arg BUILDKIT_BUILD_NAME=go:1.25.6_latest `
    --load `
    services/go/enhanced
```