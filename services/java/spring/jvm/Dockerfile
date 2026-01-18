# syntax=docker/dockerfile:1.7
ARG MAVEN_RELEASE=3.9.12
ARG JAVA_RELEASE=25
#25, 23, 21
ARG DISTRIBUTION=eclipse-temurin
ARG BASE_BUILDER=noble
ARG IMAGE_RUNTIME=gcr.io/distroless/java25-debian13:nonroot
#ARG DISTRIBUTION=amazoncorretto
#ARG BASE_BUILDER=debian
#ARG IMAGE_RUNTIME=amazoncorretto:25.0.1-al2023-headless
#alpine, al2023-headless
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"
#Option N/A for J21 set to "", for J25 set "--sun-misc-unsafe-memory-access=allow" for suppressing warnings
# ------------ BUILD STAGE -----------------------
FROM maven:${MAVEN_RELEASE}-${DISTRIBUTION}-${JAVA_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV JAVA_TOOL_OPTIONS=${JAVA_ARGS}
ENV LANGUAGE='en_US:en'
ARG PROFILE=default
ARG SPRING_BOOT_VERSION=4.0.1
ENV SPRING_BOOT_VERSION=${SPRING_BOOT_VERSION}
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 -Dmaven.artifact.threads=16"
ARG BUILD_UID=1000
ARG BUILD_GID=1000
ENV OTEL_SDK_DISABLED=true

# Ensure UID/GID are consistent across images for cache ownership
RUN set -eux; \
    # On Ubuntu noble, GID 1000 commonly already exists; reuse it instead of failing \
    if ! getent group "${BUILD_GID}" >/dev/null; then groupadd -g "${BUILD_GID}" maven; fi; \
    # Create passwd entry for UID if missing (some tools expect it) \
    if ! getent passwd "${BUILD_UID}" >/dev/null; then useradd -u "${BUILD_UID}" -g "${BUILD_GID}" -m -d /home/maven -s /bin/sh maven; fi; \
    mkdir -p /home/maven /workspace; \
    chown -R "${BUILD_UID}:${BUILD_GID}" /home/maven /workspace

USER ${BUILD_UID}:${BUILD_GID}
WORKDIR /workspace

COPY --link --chown=${BUILD_UID}:${BUILD_GID} spring/jvm/tomcat/pom.xml ./tomcat/pom.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} spring/jvm/netty/pom.xml ./netty/pom.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle.xml checkstyle.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle-suppressions.xml checkstyle-suppressions.xml

# Warm dependencies (won't be busted by source changes)
RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -v && \
    mvn -B -q -ntp  \
      -Dspring-boot.version=${SPRING_BOOT_VERSION} -f tomcat/pom.xml dependency:go-offline && \
    mvn -B -q -ntp  \
      -Dspring-boot.version=${SPRING_BOOT_VERSION} -f netty/pom.xml  dependency:go-offline

COPY --link --chown=${BUILD_UID}:${BUILD_GID} spring/jvm/tomcat/src ./tomcat/src
COPY --link --chown=${BUILD_UID}:${BUILD_GID} spring/jvm/netty/src ./netty/src

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

RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -B -ntp -T 1C \
      -Dspring-boot.version=${SPRING_BOOT_VERSION} \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml \
      package && \
    mkdir -p /workspace/out && \
    JAR="$(ls -1 target/*.jar | grep -vE '(^|/)original-|(-sources|-javadoc)\.jar$' | head -n1)" && \
    test -n "$JAR" && cp "$JAR" /workspace/out/app.jar
#    -DskipTests

# ------------ OTEL/PROFILING DEPS STAGE -----------------------
FROM alpine:3.23.2 AS otel_deps

ARG OTEL_PYROSCOPE_VERSION=1.0.4
ARG OTEL_JAVA_AGENT_VERSION=2.23.0
ARG OTEL_JAVA_AGENT_FILENAME=opentelemetry-javaagent.jar
ARG OTEL_JAVA_AGENT_URL="https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_JAVA_AGENT_VERSION}/${OTEL_JAVA_AGENT_FILENAME}"
### Snapshots - prereleased:
#ARG OTEL_JAVA_AGENT_FILENAME=opentelemetry-javaagent-${OTEL_JAVA_AGENT_VERSION}-20251212.043721-77.jar
#ARG OTEL_JAVA_AGENT_URL="https://central.sonatype.com/repository/maven-snapshots/io/opentelemetry/javaagent/opentelemetry-javaagent/${OTEL_JAVA_AGENT_VERSION}-SNAPSHOT/${OTEL_JAVA_AGENT_FILENAME}"

RUN apk add --no-cache ca-certificates curl
WORKDIR /out

# Download with BuildKit cache to speed rebuilds
RUN --mount=type=cache,id=otel-deps,target=/cache,sharing=locked \
    set -e; \
    PYRO_URL="https://github.com/grafana/otel-profiling-java/releases/download/v${OTEL_PYROSCOPE_VERSION}/pyroscope-otel.jar"; \
    PYRO_CACHE="/cache/pyroscope-otel-${OTEL_PYROSCOPE_VERSION}.jar"; \
    if [ ! -f "$PYRO_CACHE" ]; then \
      curl -fsSL --retry 5 --retry-all-errors -o "$PYRO_CACHE" "$PYRO_URL"; \
    fi; \
    cp "$PYRO_CACHE" ./pyroscope-otel-extension.jar; \
    AGENT_CACHE="/cache/opentelemetry-javaagent-${OTEL_JAVA_AGENT_VERSION}.jar"; \
    if [ ! -f "$AGENT_CACHE" ]; then \
      curl -fsSL --retry 5 --retry-all-errors -o "$AGENT_CACHE" "${OTEL_JAVA_AGENT_URL}"; \
    fi; \
    cp "$AGENT_CACHE" ./opentelemetry-javaagent.jar

#-----------------------  RUNTIME STAGE -----------------------
FROM  ${IMAGE_RUNTIME} AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
#ARG RUNTIME_USER=1001
#ARG RUNTIME_GROUP=1001
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}

WORKDIR /work/

# Install ca-certificates to support healthcheck and downloads
# Create a dedicated non-root user/group (OpenShift-friendly UID/GID 1001)
#RUN dnf install -y --setopt=install_weak_deps=False shadow-utils ca-certificates \
#    && groupadd -g ${RUNTIME_GROUP} spring \
#    && useradd -u ${RUNTIME_USER} -g spring -M -d /nonexistent -s /sbin/nologin spring \
#    && mkdir -p /work /deployments \
#    && dnf clean all && rm -rf /var/cache/dnf/*

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/out/ /deployments/
COPY --from=otel_deps --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0640 /out/pyroscope-otel-extension.jar /work/pyroscope-otel-extension.jar
COPY --from=otel_deps --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0640 /out/opentelemetry-javaagent.jar    /work/opentelemetry-javaagent.jar

EXPOSE 8080

ENV JAVA_TOOL_OPTIONS="\
    -javaagent:/work/opentelemetry-javaagent.jar \
    -Dotel.javaagent.extensions=/work/pyroscope-otel-extension.jar \
    -Djava.security.egd=file:/dev/./urandom \
    -Djdk.tracePinnedThreads=full \
    -XX:+UnlockDiagnosticVMOptions \
    -XX:+AlwaysPreTouch \
    -XX:+DebugNonSafepoints \
    -XX:+ExitOnOutOfMemoryError \
    -XX:+PreserveFramePointer \
    -XX:+UseContainerSupport \
    -XX:+UseG1GC \
    -XX:+UseStringDeduplication \
    -XX:MaxDirectMemorySize=256m \
    -XX:MaxGCPauseMillis=200 \
    -Xms1536m \
    -Xmx1536m \
    -Xlog:class+path=info \
    -Xlog:gc+init=info \
    -Xlog:gc+exit=info \
    --enable-native-access=ALL-UNNAMED \
    ${JAVA_ARGS}"

USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["java", "-jar", "/deployments/app.jar"]