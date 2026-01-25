# syntax=docker/dockerfile:1.7
ARG JAVA_RELEASE=25
#(J21 crashes on virtual threads)
ARG JAVA_MINOR_RELEASE=.0.1
ARG BASE_BUILDER=ol10
ARG IMAGE_RUNTIME=gcr.io/distroless/cc-debian13:nonroot
#ARG IMAGE_RUNTIME=debian:13.2-slim
# ------------ BUILD STAGE -----------------------
FROM container-registry.oracle.com/graalvm/native-image:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_BUILDER} AS builder
#FROM ghcr.io/graalvm/native-image-community:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
#For J25 set "--sun-misc-unsafe-memory-access=allow" for suppressing warnings, N/A for J21
ENV JAVA_TOOL_OPTIONS="--sun-misc-unsafe-memory-access=allow"
ARG PROFILE=tomcat
ARG VIRTUAL_ENABLED=false
ENV VIRTUAL_ENABLED=${VIRTUAL_ENABLED}
ARG SPRING_BOOT_VERSION=4.0.2
ENV SPRING_BOOT_VERSION=${SPRING_BOOT_VERSION}
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 -Dmaven.artifact.threads=16"

ARG YQ_VERSION=4.50.1
RUN microdnf install -y curl && microdnf clean all && \
    curl -L "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" \
      -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq

# Ensure UID/GID are consistent across images for cache ownership
RUN groupadd -g 1000 maven \
 && useradd  -u 1000 -g maven -d /home/maven -s /bin/sh maven \
 && mkdir -p /home/maven /workspace \
 && chown -R 1000:1000 /home/maven /workspace

USER 1000
WORKDIR /workspace

COPY --link --chown=1000:1000 spring/native/.mvn/ .mvn
COPY --link --chown=1000:1000 spring/native/mvnw ./mvnw
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
COPY --link --chown=1000:1000 spring/native/tomcat/pom.xml ./tomcat/pom.xml
COPY --link --chown=1000:1000 spring/native/netty/pom.xml ./netty/pom.xml
COPY --link --chown=1000:1000 checkstyle.xml checkstyle.xml
COPY --link --chown=1000:1000 checkstyle-suppressions.xml checkstyle-suppressions.xml

# Warm dependencies (won't be busted by source changes)
RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    ./mvnw -v && \
    ./mvnw -B -q -ntp \
      -Dspring-boot.version=${SPRING_BOOT_VERSION} -f tomcat/pom.xml dependency:go-offline && \
    ./mvnw -B -q -ntp \
      -Dspring-boot.version=${SPRING_BOOT_VERSION} -f netty/pom.xml dependency:go-offline

COPY --link --chown=1000:1000 spring/jvm/tomcat/src ./tomcat/src
COPY --link --chown=1000:1000 spring/jvm/netty/src ./netty/src

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

RUN echo "VIRTUAL_ENABLED=$VIRTUAL_ENABLED"

RUN yq -i '.spring.threads.virtual.enabled = (env(VIRTUAL_ENABLED) == "true")' \
       src/main/resources/application.yml

RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    ./mvnw -B -ntp -T 1C \
      -Dspring-boot.version=${SPRING_BOOT_VERSION} \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml \
      -Pnative native:compile \
      -DskipTests

ARG APP_NAME=spring-native-${PROFILE}

# Create /workspace/out with ONE real binary + symlinks (app + optional aliases)
RUN set -eux; \
    APP_NAME="spring-native-${PROFILE}"; \
    BIN="/workspace/target/${APP_NAME}"; \
    OUT="/workspace/out"; \
    mkdir -p "${OUT}"; \
    if [ "${PROFILE}" = "netty" ]; then \
      install -m 0555 "${BIN}" "${OUT}/${APP_NAME}"; \
      ln -sf "${APP_NAME}" "${OUT}/app"; \
    else \
      if [ "${VIRTUAL_ENABLED}" = "true" ]; then SUFFIX="virtual"; else SUFFIX="platform"; fi; \
      VARIANT="${APP_NAME}-${SUFFIX}"; \
      mv "${BIN}" "/workspace/target/${VARIANT}"; \
      install -m 0555 "/workspace/target/${VARIANT}" "${OUT}/${VARIANT}"; \
      ln -sf "${VARIANT}" "${OUT}/app"; \
    fi

#-----------------------  RUNTIME STAGE -----------------------
FROM ${IMAGE_RUNTIME} AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
#ARG RUNTIME_USER=1001
#ARG RUNTIME_GROUP=1001
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}

WORKDIR /native

# Install ca-certificates to support healthcheck and downloads
# Create a dedicated non-root user/group (OpenShift-friendly UID/GID 1001)
#RUN apt-get update \
# && apt-get install -y --no-install-recommends ca-certificates adduser \
# && rm -rf /var/lib/apt/lists/* \
# && addgroup --gid ${RUNTIME_GROUP} spring \
# && adduser  --uid ${RUNTIME_USER} --gid ${RUNTIME_GROUP} \
#            --home /nonexistent --no-create-home \
#            --shell /usr/sbin/nologin --disabled-password --gecos "" spring

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/out/ /native/
EXPOSE 8080
USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["/native/app"]