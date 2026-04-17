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
  -t spring-jvm-tomcat-platform:4.0.5_latest `
  --build-arg PROFILE=tomcat `
  --build-arg SPRING_BOOT_VERSION=4.0.5 `
  --build-arg BUILDKIT_BUILD_NAME=spring-jvm-tomcat-platform:4.0.5_latest `
  --load `
  services/java
```
**spring-jvm-tomcat-virtual**
```powershell
docker buildx build `
    -f services/java/spring/jvm/Dockerfile `
    -t spring-jvm-tomcat-virtual:4.0.5_latest `
    --build-arg PROFILE=tomcat `
    --build-arg SPRING_BOOT_VERSION=4.0.5 `
    --build-arg BUILDKIT_BUILD_NAME=spring-jvm-tomcat-virtual:4.0.5_latest `
    --load `
    services/java
```
**spring-jvm-netty**
```powershell
docker buildx build `
  -f services/java/spring/jvm/Dockerfile `
  -t spring-jvm-netty:4.0.5_latest `
  --build-arg PROFILE=netty `
  --build-arg SPRING_BOOT_VERSION=4.0.5 `
  --build-arg BUILDKIT_BUILD_NAME=spring-jvm-netty:4.0.5_latest `
  --load `
  services/java
```
**spring-native-tomcat-platform**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-tomcat-platform:4.0.5_latest `
  --build-arg PROFILE=tomcat `
  --build-arg VIRTUAL_ENABLED=false `
  --build-arg SPRING_BOOT_VERSION=4.0.5 `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-tomcat-platform:4.0.5_latest `
  --load `
  services/java
```
**spring-native-tomcat-virtual**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-tomcat-virtual:4.0.5_latest `
  --build-arg PROFILE=tomcat `
  --build-arg VIRTUAL_ENABLED=true `
  --build-arg SPRING_BOOT_VERSION=4.0.5 `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-tomcat-virtual:4.0.5_latest `
  --load `
  services/java
```
**spring-native-netty**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t spring-native-netty:4.0.5_latest `
  --build-arg PROFILE=netty `
  --build-arg VIRTUAL_ENABLED=false `
  --build-arg SPRING_BOOT_VERSION=4.0.5 `
  --build-arg BUILDKIT_BUILD_NAME=spring-native-netty:4.0.5_latest `
  --load `
  services/java
```
**quarkus-jvm**
```powershell
docker buildx build `
  -f services/java/quarkus/jvm/Dockerfile `
  -t quarkus-jvm:3.34.5_latest `
  --build-arg QUARKUS_VERSION=3.34.5 `
  --build-arg BUILDKIT_BUILD_NAME=quarkus-jvm:3.34.5_latest `
  --load `
  services/java
```
**quarkus-native**
```powershell
docker buildx build `
    -f services/java/quarkus/native/Dockerfile `
    -t quarkus-native:3.34.5_latest `
    --build-arg QUARKUS_VERSION=3.34.5 `
    --build-arg BUILDKIT_BUILD_NAME=quarkus-native:3.34.5_latest `
    --load `
    services/java
```
**micronaut-jvm**
```powershell
docker buildx build `
  -f services/java/micronaut/jvm/Dockerfile `
  -t micronaut-jvm:4.10.18_latest `
  --build-arg MICRONAUT_VERSION=4.10.18 `
  --build-arg BUILDKIT_BUILD_NAME=micronaut-jvm:4.10.18_latest `
  --load `
  services/java
```
**micronaut-native**
```powershell
docker buildx build `
  -f services/java/micronaut/native/Dockerfile `
  -t micronaut-native:4.10.18_latest `
  --build-arg MICRONAUT_VERSION=4.10.18 `
  --build-arg BUILDKIT_BUILD_NAME=micronaut-native:4.10.18_latest `
  --load `
  services/java
```
**helidon-se-jvm**
```powershell
docker buildx build `
  -f services/java/helidon/se/jvm/Dockerfile `
  -t helidon-se-jvm:4.3.4_latest `
  --build-arg HELIDON_VERSION=4.3.4 `
  --build-arg BUILDKIT_BUILD_NAME=helidon-se-jvm:4.3.4_latest `
  --load `
  services/java
```
**helidon-se-native**
```powershell
docker buildx build `
  -f services/java/helidon/se/native/Dockerfile `
  -t helidon-se-native:4.3.4_latest `
  --build-arg HELIDON_VERSION=4.3.4 `
  --build-arg BUILDKIT_BUILD_NAME=helidon-se-native:4.3.4_latest `
  --load `
  services/java
```
**helidon-mp-jvm**
```powershell
docker buildx build `
  -f services/java/helidon/mp/jvm/Dockerfile `
  -t helidon-mp-jvm:4.3.4_latest `
  --build-arg HELIDON_VERSION=4.3.4 `
  --build-arg BUILDKIT_BUILD_NAME=helidon-mp-jvm:4.3.4_latest `
  --load `
  services/java
```
**helidon-mp-native**
```powershell
docker buildx build `
  -f services/java/helidon/mp/native/Dockerfile `
  -t helidon-mp-native:4.3.4_latest `
  --build-arg HELIDON_VERSION=4.3.4 `
  --build-arg BUILDKIT_BUILD_NAME=helidon-mp-native:4.3.4_latest `
  --load `
  services/java
```
**spark-jvm-platform**
```powershell
docker buildx build `
  -f services/java/spark/jvm/Dockerfile `
  -t spark-jvm-platform:3.0.4_latest `
  --build-arg SPARK_VERSION=3.0.4 `
  --build-arg BUILDKIT_BUILD_NAME=spark-jvm:3.0.4_latest `
  --load `
  services/java
```
**spark-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/spark/jvm/Dockerfile `
  -t spark-jvm-virtual:3.0.4_latest `
  --build-arg SPARK_VERSION=3.0.4 `
  --build-arg BUILDKIT_BUILD_NAME=spark-jvm:3.0.4_latest `
  --load `
  services/java
```
**javalin-jvm-platform**
```powershell
docker buildx build `
  -f services/java/javalin/jvm/Dockerfile `
  -t javalin-jvm-platform:7.1.0_latest `
  --build-arg JAVALIN_VERSION=7.1.0 `
  --build-arg BUILDKIT_BUILD_NAME=javalin-jvm:7.1.0_latest `
  --load `
  services/java
```
**javalin-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/javalin/jvm/Dockerfile `
  -t javalin-jvm-virtual:7.1.0_latest `
  --build-arg JAVALIN_VERSION=7.1.0 `
  --build-arg BUILDKIT_BUILD_NAME=javalin-jvm:7.1.0_latest `
  --load `
  services/java
```
**dropwizard-jvm-platform**
```powershell
docker buildx build `
  -f services/java/dropwizard/jvm/Dockerfile `
  -t dropwizard-jvm-platform:5.0.1_latest `
  --build-arg DROPWIZARD_VERSION=5.0.1 `
  --build-arg BUILDKIT_BUILD_NAME=dropwizard-jvm:5.0.1_latest `
  --load `
  services/java
```
**dropwizard-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/dropwizard/jvm/Dockerfile `
  -t dropwizard-jvm-virtual:5.0.1_latest `
  --build-arg DROPWIZARD_VERSION=5.0.1 `
  --build-arg BUILDKIT_BUILD_NAME=dropwizard-jvm:5.0.1_latest `
  --load `
  services/java
```
**vertx-jvm**
```powershell
docker buildx build `
  -f services/java/vertx/jvm/Dockerfile `
  -t vertx-jvm:5.0.8_latest `
  --build-arg VERTX_VERSION=5.0.8 `
  --build-arg BUILDKIT_BUILD_NAME=vertx-jvm:5.0.8_latest `
  --load `
  services/java
```
**pekko-jvm**
```powershell
docker buildx build `
  -f services/java/pekko/jvm/Dockerfile `
  -t pekko-jvm:1.3.0_latest `
  --build-arg PEKKO_VERSION=1.3.0 `
  --build-arg BUILDKIT_BUILD_NAME=pekko-jvm:1.3.0_latest `
  --load `
  services/java
```
**go**
```powershell
docker buildx build `
    -f services/go/enhanced/Dockerfile `
    -t go:1.26.2_latest `
    --build-arg GO_VERSION=1.26.2 `
    --build-arg BUILDKIT_BUILD_NAME=go:1.26.2_latest `
    --load `
    services/go/enhanced
```
**django-platform**
```powershell
docker buildx build `
    -f services/python/django/gunicorn/WSGI/Dockerfile `
    -t django-platform:6.0.4_latest `
    --build-arg PYTHON_VERSION=3.13.13 `
    --build-arg BUILDKIT_BUILD_NAME=django-platform:6.0.4_latest `
    --load `
    services/python/django
```
**django-reactive**
```powershell
docker buildx build `
    -f services/python/django/gunicorn/ASGI/Dockerfile `
    -t django-reactive:6.0.4_latest `
    --build-arg PYTHON_VERSION=3.13.13 `
    --build-arg BUILDKIT_BUILD_NAME=django-reactive:6.0.4_latest `
    --load `
    services/python/django
```
