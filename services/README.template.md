<!-- Generated from `services/README.template.md` via `scripts/render-readmes.mjs`. Do not edit `services/README.md` directly. -->

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
docker pull container-registry.oracle.com/graalvm/native-image:25.0.2-ol9
  ```
Native builder image pull from GraalVM community:
  ```bash
docker pull ghcr.io/graalvm/native-image-community:25.0.2-ol9
  ```

### Service Image Builders
*This is pretty much the same as running in IntelliJ the Docker scripts prefixed with '[build-img]' which are under the '.run' directory.*

Run from the project root directory.

**spring-jvm-tomcat-platform**
```powershell
docker buildx build `
  -f services/java/spring/jvm/Dockerfile `
  -t spring-jvm-tomcat-platform:{{SPRING_BOOT_VERSION}}_latest `
  --build-arg PROFILE=tomcat `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=spring-jvm-tomcat-platform:{{SPRING_BOOT_VERSION}}_latest `
  --load `
  services/java
```
**spring-jvm-tomcat-virtual**
```powershell
docker buildx build `
    -f services/java/spring/jvm/Dockerfile `
    -t spring-jvm-tomcat-virtual:{{SPRING_BOOT_VERSION}}_latest `
    --build-arg PROFILE=tomcat `
    --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME=spring-jvm-tomcat-virtual:{{SPRING_BOOT_VERSION}}_latest `
    --load `
    services/java
```
**spring-jvm-netty**
```powershell
docker buildx build `
  -f services/java/spring/jvm/Dockerfile `
  -t spring-jvm-netty:{{SPRING_BOOT_VERSION}}_latest `
  --build-arg PROFILE=netty `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=spring-jvm-netty:{{SPRING_BOOT_VERSION}}_latest `
  --load `
  services/java
```
**spring-native-tomcat-platform**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-tomcat-platform:{{SPRING_BOOT_VERSION}}_latest `
  --build-arg PROFILE=tomcat `
  --build-arg VIRTUAL_ENABLED=false `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-tomcat-platform:{{SPRING_BOOT_VERSION}}_latest `
  --load `
  services/java
```
**spring-native-tomcat-virtual**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-tomcat-virtual:{{SPRING_BOOT_VERSION}}_latest `
  --build-arg PROFILE=tomcat `
  --build-arg VIRTUAL_ENABLED=true `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-tomcat-virtual:{{SPRING_BOOT_VERSION}}_latest `
  --load `
  services/java
```
**spring-native-netty**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-netty:{{SPRING_BOOT_VERSION}}_latest `
  --build-arg PROFILE=netty `
  --build-arg VIRTUAL_ENABLED=false `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-netty:{{SPRING_BOOT_VERSION}}_latest `
  --load `
  services/java
```
**quarkus-jvm**
```powershell
docker buildx build `
  -f services/java/quarkus/jvm/Dockerfile `
  -t quarkus-jvm:{{QUARKUS_VERSION}}_latest `
  --build-arg QUARKUS_VERSION={{QUARKUS_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=quarkus-jvm:{{QUARKUS_VERSION}}_latest `
  --load `
  services/java
```
**quarkus-native**
```powershell
docker buildx build `
    -f services/java/quarkus/native/Dockerfile `
    -t quarkus-native:{{QUARKUS_VERSION}}_latest `
    --build-arg QUARKUS_VERSION={{QUARKUS_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME=quarkus-native:{{QUARKUS_VERSION}}_latest `
    --load `
    services/java
```
**micronaut-jvm**
```powershell
docker buildx build `
  -f services/java/micronaut/jvm/Dockerfile `
  -t micronaut-jvm:{{MICRONAUT_VERSION}}_latest `
  --build-arg MICRONAUT_VERSION={{MICRONAUT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=micronaut-jvm:{{MICRONAUT_VERSION}}_latest `
  --load `
  services/java
```
**micronaut-native**
```powershell
docker buildx build `
  -f services/java/micronaut/native/Dockerfile `
  -t micronaut-native:{{MICRONAUT_VERSION}}_latest `
  --build-arg MICRONAUT_VERSION={{MICRONAUT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=micronaut-native:{{MICRONAUT_VERSION}}_latest `
  --load `
  services/java
```
**helidon-se-jvm**
```powershell
docker buildx build `
  -f services/java/helidon/se/jvm/Dockerfile `
  -t helidon-se-jvm:{{HELIDON_VERSION}}_latest `
  --build-arg HELIDON_VERSION={{HELIDON_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=helidon-se-jvm:{{HELIDON_VERSION}}_latest `
  --load `
  services/java
```
**helidon-se-native**
```powershell
docker buildx build `
  -f services/java/helidon/se/native/Dockerfile `
  -t helidon-se-native:{{HELIDON_VERSION}}_latest `
  --build-arg HELIDON_VERSION={{HELIDON_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=helidon-se-native:{{HELIDON_VERSION}}_latest `
  --load `
  services/java
```
**helidon-mp-jvm**
```powershell
docker buildx build `
  -f services/java/helidon/mp/jvm/Dockerfile `
  -t helidon-mp-jvm:{{HELIDON_VERSION}}_latest `
  --build-arg HELIDON_VERSION={{HELIDON_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=helidon-mp-jvm:{{HELIDON_VERSION}}_latest `
  --load `
  services/java
```
**helidon-mp-native**
```powershell
docker buildx build `
  -f services/java/helidon/mp/native/Dockerfile `
  -t helidon-mp-native:{{HELIDON_VERSION}}_latest `
  --build-arg HELIDON_VERSION={{HELIDON_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=helidon-mp-native:{{HELIDON_VERSION}}_latest `
  --load `
  services/java
```
**spark-jvm-platform**
```powershell
docker buildx build `
  -f services/java/spark/jvm/Dockerfile `
  -t spark-jvm-platform:{{SPARK_VERSION}}_latest `
  --build-arg SPARK_VERSION={{SPARK_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=spark-jvm:{{SPARK_VERSION}}_latest `
  --load `
  services/java
```
**spark-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/spark/jvm/Dockerfile `
  -t spark-jvm-virtual:{{SPARK_VERSION}}_latest `
  --build-arg SPARK_VERSION={{SPARK_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=spark-jvm:{{SPARK_VERSION}}_latest `
  --load `
  services/java
```
**javalin-jvm-platform**
```powershell
docker buildx build `
  -f services/java/javalin/jvm/Dockerfile `
  -t javalin-jvm-platform:{{JAVALIN_VERSION}}_latest `
  --build-arg JAVALIN_VERSION={{JAVALIN_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=javalin-jvm:{{JAVALIN_VERSION}}_latest `
  --load `
  services/java
```
**javalin-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/javalin/jvm/Dockerfile `
  -t javalin-jvm-virtual:{{JAVALIN_VERSION}}_latest `
  --build-arg JAVALIN_VERSION={{JAVALIN_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=javalin-jvm:{{JAVALIN_VERSION}}_latest `
  --load `
  services/java
```
**dropwizard-jvm-platform**
```powershell
docker buildx build `
  -f services/java/dropwizard/jvm/Dockerfile `
  -t dropwizard-jvm-platform:{{DROPWIZARD_VERSION}}_latest `
  --build-arg DROPWIZARD_VERSION={{DROPWIZARD_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=dropwizard-jvm:{{DROPWIZARD_VERSION}}_latest `
  --load `
  services/java
```
**dropwizard-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/dropwizard/jvm/Dockerfile `
  -t dropwizard-jvm-virtual:{{DROPWIZARD_VERSION}}_latest `
  --build-arg DROPWIZARD_VERSION={{DROPWIZARD_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=dropwizard-jvm:{{DROPWIZARD_VERSION}}_latest `
  --load `
  services/java
```
**vertx-jvm**
```powershell
docker buildx build `
  -f services/java/vertx/jvm/Dockerfile `
  -t vertx-jvm:{{VERTX_VERSION}}_latest `
  --build-arg VERTX_VERSION={{VERTX_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=vertx-jvm:{{VERTX_VERSION}}_latest `
  --load `
  services/java
```
**pekko-jvm**
```powershell
docker buildx build `
  -f services/java/pekko/jvm/Dockerfile `
  -t pekko-jvm:{{PEKKO_VERSION}}_latest `
  --build-arg PEKKO_VERSION={{PEKKO_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=pekko-jvm:{{PEKKO_VERSION}}_latest `
  --load `
  services/java
```
**go**
```powershell
docker buildx build `
    -f services/go/enhanced/Dockerfile `
    -t go:{{GO_VERSION}}_latest `
    --build-arg GO_VERSION={{GO_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME=go:{{GO_VERSION}}_latest `
    --load `
    services/go/enhanced
```
