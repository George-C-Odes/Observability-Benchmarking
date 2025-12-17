# syntax=docker/dockerfile:1.7
ARG JAVA_RELEASE=25
#(J21 crashes on virtual threads)
ARG JAVA_MINOR_RELEASE=.0.1
ARG BASE_BUILDER=ol10
#For J25 set "--sun-misc-unsafe-memory-access=allow" for suppressing warnings, N/A for J21
# Build stage – GraalVM Native Image (JDK 25)
FROM container-registry.oracle.com/graalvm/native-image:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_BUILDER} AS builder
#FROM ghcr.io/graalvm/native-image-community:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ENV JAVA_TOOL_OPTIONS="--sun-misc-unsafe-memory-access=allow"
ARG PROFILE=default
ARG VIRTUAL_ENABLED=false
ENV VIRTUAL_ENABLED=${VIRTUAL_ENABLED}
ARG SPRING_BOOT_VERSION=4.0.0
ENV SPRING_BOOT_VERSION=${SPRING_BOOT_VERSION}
WORKDIR /workspace

RUN microdnf install -y curl && microdnf clean all && \
    curl -L "https://github.com/mikefarah/yq/releases/download/v4.49.2/yq_linux_amd64" \
      -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq

COPY spring/native/tomcat/pom.xml ./tomcat/pom.xml
COPY spring/jvm/tomcat/src ./tomcat/src
COPY spring/native/netty/pom.xml ./netty/pom.xml
COPY spring/jvm/netty/src ./netty/src
COPY checkstyle.xml checkstyle.xml
COPY checkstyle-suppressions.xml checkstyle-suppressions.xml

# Conditionally select the correct POM and src files
RUN if [ "$PROFILE" = "netty" ]; then \
        echo "Preparing NETTY sources with PROFILE:$PROFILE and SPRING_BOOT_VERSION:$SPRING_BOOT_VERSION"; \
        cp ./netty/pom.xml pom.xml; \
        cp -r ./netty/src ./src; \
        rm -f ./tomcat/pom.xml; \
        rm -rf ./tomcat/src; \
    else \
        echo "Preparing TOMCAT sources with PROFILE:$PROFILE and SPRING_BOOT_VERSION:$SPRING_BOOT_VERSION"; \
        cp ./tomcat/pom.xml pom.xml; \
        cp -r ./tomcat/src ./src; \
        rm -f ./netty/pom.xml; \
        rm -rf ./netty/src; \
    fi

COPY spring/native/.mvn/ .mvn
COPY spring/native/mvnw ./mvnw
RUN chmod +x mvnw

RUN echo "VIRTUAL_ENABLED=$VIRTUAL_ENABLED"

RUN yq -i '.spring.threads.virtual.enabled = (env(VIRTUAL_ENABLED) == "true")' \
       src/main/resources/application.yml

RUN ./mvnw -v \
  && ./mvnw -B -q -Dspring-boot.version=${SPRING_BOOT_VERSION} dependency:go-offline \
  && ./mvnw -B \
    -Dspring-boot.version=${SPRING_BOOT_VERSION} \
    -Pnative native:compile \
    -Dmaven.artifact.threads=16 \
    -Dmaven.compiler.release=${JAVA_RELEASE} \
    -Dcheckstyle.config.location=checkstyle.xml \
    -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml

# 2) Runtime stage – ultra-small, high-throughput
FROM debian:13.2-slim AS runner
WORKDIR /native

ARG PROFILE
ARG APP_NAME=spring-native-${PROFILE}
COPY --from=builder /workspace/target/${APP_NAME} /native/${APP_NAME}

ARG VIRTUAL_ENABLED

RUN if [ "$PROFILE" = "netty" ]; then \
        echo "Renaming $APP_NAME for NETTY with PROFILE:$PROFILE and VIRTUAL_ENABLED:$VIRTUAL_ENABLED"; \
    else \
        echo "Renaming $APP_NAME for TOMCAT with PROFILE:$PROFILE and VIRTUAL_ENABLED:$VIRTUAL_ENABLED"; \
        if [ "$VIRTUAL_ENABLED" = "false" ]; then \
            mv /native/${APP_NAME} /native/${APP_NAME}-platform; \
        else \
            mv /native/${APP_NAME} /native/${APP_NAME}-virtual; \
        fi; \
    fi

USER 65532:65532
EXPOSE 8080