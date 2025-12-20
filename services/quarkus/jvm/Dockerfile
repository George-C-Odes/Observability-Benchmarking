# syntax=docker/dockerfile:1.7
ARG MAVEN_RELEASE=3.9.12
ARG DISTRIBUTION=amazoncorretto
#amazoncorretto, eclipse-temurin
ARG JAVA_RELEASE=25
#25, 23, 21
ARG JAVA_MINOR_RELEASE=.0.1
ARG BASE_BUILDER=debian
#noble, alpine, debian
ARG BASE_RUNTIME=al2023-headless
#jre-ubi10-minimal, alpine, al2023-headless
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"
#Option N/A for J21 set to "", for J25 set "--sun-misc-unsafe-memory-access=allow" for suppressing warnings

FROM maven:${MAVEN_RELEASE}-${DISTRIBUTION}-${JAVA_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV JAVA_TOOL_OPTIONS=${JAVA_ARGS}
ARG QUARKUS_VERSION=3.30.4
ENV QUARKUS_VERSION=${QUARKUS_VERSION}
ENV LANGUAGE='en_US:en'
ENV QUARKUS_NATIVE_ENABLED=false
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 -Dmaven.artifact.threads=16"

# Ensure UID/GID are consistent across images for cache ownership
RUN groupadd -g 1000 maven \
 && useradd  -u 1000 -g maven -d /home/maven -s /bin/sh maven \
 && mkdir -p /home/maven /workspace \
 && chown -R 1000:1000 /home/maven /workspace

USER 1000
WORKDIR /workspace

COPY --link --chown=1000:1000 quarkus/jvm/pom.xml pom.xml
COPY --link --chown=1000:1000 checkstyle.xml checkstyle.xml
COPY --link --chown=1000:1000 checkstyle-suppressions.xml checkstyle-suppressions.xml

# Warm dependencies (won't be busted by source changes)
RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    mvn -v &&  \
    mvn -B -q -ntp \
      -Dquarkus.platform.version=${QUARKUS_VERSION} \
      dependency:go-offline

COPY --link --chown=1000:1000 quarkus/jvm/src ./src

RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    mvn -B -ntp -T 1C \
      -Dquarkus.platform.version=${QUARKUS_VERSION} \
      -Dquarkus.package.jar.type=fast-jar \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml \
      package
#-DskipTests
#uber-jar

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
FROM ${DISTRIBUTION}:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_RUNTIME} AS runner
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV QUARKUS_HTTP_HOST=0.0.0.0
ENV QUARKUS_HTTP_PORT=8080

WORKDIR /work

# Install ca-certificates to support healthcheck and downloads
# Create a dedicated non-root user/group (OpenShift-friendly UID/GID 1001)
RUN dnf install -y --setopt=install_weak_deps=False shadow-utils ca-certificates \
    && groupadd -g 1001 quarkus \
    && useradd -u 1001 -g quarkus -M -d /nonexistent -s /sbin/nologin quarkus \
    && mkdir -p /work /deployments \
    && dnf clean all && rm -rf /var/cache/dnf/*

COPY --from=builder --chown=1001:1001 /workspace/target/quarkus-app/ /deployments/
COPY --from=otel_deps --chown=1001:1001 --chmod=0640 /out/pyroscope-otel-extension.jar /work/pyroscope-otel-extension.jar
COPY --from=otel_deps --chown=1001:1001 --chmod=0640 /out/opentelemetry-javaagent.jar    /work/opentelemetry-javaagent.jar

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

USER 1001
ENTRYPOINT ["java", "-jar", "/deployments/quarkus-run.jar"]