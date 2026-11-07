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
docker pull container-registry-frankfurt.oracle.com/graalvm/native-image:{{JAVA_MAJOR_VERSION}}.{{JAVA_MINOR_PATCH_VERSION}}-ol9
  ```
Native builder image pull from GraalVM community:
  ```bash
docker pull ghcr.io/graalvm/native-image-community:{{JAVA_MAJOR_VERSION}}.{{JAVA_MINOR_PATCH_VERSION}}-ol9
  ```

### Service Image Builders
*This is pretty much the same as running in IntelliJ the Docker scripts prefixed with '[build-img]' which are under the '.run' directory.*

Run from the project root directory.

**spring-jvm-tomcat-platform**
```powershell
docker buildx build `
  -f services/java/spring/jvm/Dockerfile `
  -t {{SPRING_JVM_TOMCAT_PLATFORM_IMAGE}} `
  --build-arg PROFILE=tomcat `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{SPRING_JVM_TOMCAT_PLATFORM_IMAGE}} `
  --load `
  services/java
```
**spring-jvm-tomcat-virtual**
```powershell
docker buildx build `
    -f services/java/spring/jvm/Dockerfile `
    -t {{SPRING_JVM_TOMCAT_VIRTUAL_IMAGE}} `
    --build-arg PROFILE=tomcat `
    --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME={{SPRING_JVM_TOMCAT_VIRTUAL_IMAGE}} `
    --load `
    services/java
```
**spring-jvm-netty**
```powershell
docker buildx build `
  -f services/java/spring/jvm/Dockerfile `
  -t {{SPRING_JVM_NETTY_IMAGE}} `
  --build-arg PROFILE=netty `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{SPRING_JVM_NETTY_IMAGE}} `
  --load `
  services/java
```
**spring-native-tomcat-platform**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t {{SPRING_NATIVE_TOMCAT_PLATFORM_IMAGE}} `
  --build-arg PROFILE=tomcat `
  --build-arg VIRTUAL_ENABLED=false `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{SPRING_NATIVE_TOMCAT_PLATFORM_IMAGE}} `
  --load `
  services/java
```
**spring-native-tomcat-virtual**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t {{SPRING_NATIVE_TOMCAT_VIRTUAL_IMAGE}} `
  --build-arg PROFILE=tomcat `
  --build-arg VIRTUAL_ENABLED=true `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{SPRING_NATIVE_TOMCAT_VIRTUAL_IMAGE}} `
  --load `
  services/java
```
**spring-native-netty**
```powershell
docker buildx build `
  -f services/java/spring/native/Dockerfile `
  -t {{SPRING_NATIVE_NETTY_IMAGE}} `
  --build-arg PROFILE=netty `
  --build-arg VIRTUAL_ENABLED=false `
  --build-arg SPRING_BOOT_VERSION={{SPRING_BOOT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{SPRING_NATIVE_NETTY_IMAGE}} `
  --load `
  services/java
```
**quarkus-jvm**
```powershell
docker buildx build `
  -f services/java/quarkus/jvm/Dockerfile `
  -t {{QUARKUS_JVM_IMAGE}} `
  --build-arg QUARKUS_VERSION={{QUARKUS_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{QUARKUS_JVM_IMAGE}} `
  --load `
  services/java
```
**quarkus-native**
```powershell
docker buildx build `
    -f services/java/quarkus/native/Dockerfile `
    -t {{QUARKUS_NATIVE_IMAGE}} `
    --build-arg QUARKUS_VERSION={{QUARKUS_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME={{QUARKUS_NATIVE_IMAGE}} `
    --load `
    services/java
```
**micronaut-jvm**
```powershell
docker buildx build `
  -f services/java/micronaut/jvm/Dockerfile `
  -t {{MICRONAUT_JVM_IMAGE}} `
  --build-arg MICRONAUT_VERSION={{MICRONAUT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{MICRONAUT_JVM_IMAGE}} `
  --load `
  services/java
```
**micronaut-native**
```powershell
docker buildx build `
  -f services/java/micronaut/native/Dockerfile `
  -t {{MICRONAUT_NATIVE_IMAGE}} `
  --build-arg MICRONAUT_VERSION={{MICRONAUT_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{MICRONAUT_NATIVE_IMAGE}} `
  --load `
  services/java
```
**helidon-se-jvm**
```powershell
docker buildx build `
  -f services/java/helidon/se/jvm/Dockerfile `
  -t {{HELIDON_SE_JVM_IMAGE}} `
  --build-arg HELIDON_VERSION={{HELIDON_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{HELIDON_SE_JVM_IMAGE}} `
  --load `
  services/java
```
**helidon-se-native**
```powershell
docker buildx build `
  -f services/java/helidon/se/native/Dockerfile `
  -t {{HELIDON_SE_NATIVE_IMAGE}} `
  --build-arg HELIDON_VERSION={{HELIDON_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{HELIDON_SE_NATIVE_IMAGE}} `
  --load `
  services/java
```
**helidon-mp-jvm**
```powershell
docker buildx build `
  -f services/java/helidon/mp/jvm/Dockerfile `
  -t {{HELIDON_MP_JVM_IMAGE}} `
  --build-arg HELIDON_VERSION={{HELIDON_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{HELIDON_MP_JVM_IMAGE}} `
  --load `
  services/java
```
**helidon-mp-native**
```powershell
docker buildx build `
  -f services/java/helidon/mp/native/Dockerfile `
  -t {{HELIDON_MP_NATIVE_IMAGE}} `
  --build-arg HELIDON_VERSION={{HELIDON_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{HELIDON_MP_NATIVE_IMAGE}} `
  --load `
  services/java
```
**spark-jvm-platform**
```powershell
docker buildx build `
  -f services/java/spark/jvm/Dockerfile `
  -t {{SPARK_JVM_PLATFORM_IMAGE}} `
  --build-arg SPARK_VERSION={{SPARK_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{SPARK_JVM_IMAGE}} `
  --load `
  services/java
```
**spark-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/spark/jvm/Dockerfile `
  -t {{SPARK_JVM_VIRTUAL_IMAGE}} `
  --build-arg SPARK_VERSION={{SPARK_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{SPARK_JVM_IMAGE}} `
  --load `
  services/java
```
**javalin-jvm-platform**
```powershell
docker buildx build `
  -f services/java/javalin/jvm/Dockerfile `
  -t {{JAVALIN_JVM_PLATFORM_IMAGE}} `
  --build-arg JAVALIN_VERSION={{JAVALIN_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{JAVALIN_JVM_IMAGE}} `
  --load `
  services/java
```
**javalin-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/javalin/jvm/Dockerfile `
  -t {{JAVALIN_JVM_VIRTUAL_IMAGE}} `
  --build-arg JAVALIN_VERSION={{JAVALIN_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{JAVALIN_JVM_IMAGE}} `
  --load `
  services/java
```
**dropwizard-jvm-platform**
```powershell
docker buildx build `
  -f services/java/dropwizard/jvm/Dockerfile `
  -t {{DROPWIZARD_JVM_PLATFORM_IMAGE}} `
  --build-arg DROPWIZARD_VERSION={{DROPWIZARD_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{DROPWIZARD_JVM_IMAGE}} `
  --load `
  services/java
```
**dropwizard-jvm-virtual**
```powershell
docker buildx build `
  -f services/java/dropwizard/jvm/Dockerfile `
  -t {{DROPWIZARD_JVM_VIRTUAL_IMAGE}} `
  --build-arg DROPWIZARD_VERSION={{DROPWIZARD_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{DROPWIZARD_JVM_IMAGE}} `
  --load `
  services/java
```
**vertx-jvm**
```powershell
docker buildx build `
  -f services/java/vertx/jvm/Dockerfile `
  -t {{VERTX_JVM_IMAGE}} `
  --build-arg VERTX_VERSION={{VERTX_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{VERTX_JVM_IMAGE}} `
  --load `
  services/java
```
**pekko-jvm**
```powershell
docker buildx build `
  -f services/java/pekko/jvm/Dockerfile `
  -t {{PEKKO_JVM_IMAGE}} `
  --build-arg PEKKO_VERSION={{PEKKO_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME={{PEKKO_JVM_IMAGE}} `
  --load `
  services/java
```
**go**
```powershell
docker buildx build `
    -f services/go/enhanced/Dockerfile `
    -t {{GO_IMAGE}} `
    --build-arg GO_VERSION={{GO_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME={{GO_IMAGE}} `
    --load `
    services/go/enhanced
```
**django-platform**
```powershell
docker buildx build `
    -f services/python/django/gunicorn/WSGI/Dockerfile `
    -t {{DJANGO_PLATFORM_IMAGE}} `
    --build-arg PYTHON_VERSION={{PYTHON_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME={{DJANGO_PLATFORM_IMAGE}} `
    --load `
    services/python/django
```
**django-reactive**
```powershell
docker buildx build `
    -f services/python/django/gunicorn/ASGI/Dockerfile `
    -t {{DJANGO_REACTIVE_IMAGE}} `
    --build-arg PYTHON_VERSION={{PYTHON_VERSION}} `
    --build-arg BUILDKIT_BUILD_NAME={{DJANGO_REACTIVE_IMAGE}} `
    --load `
    services/python/django
```
