# syntax=docker/dockerfile:1.28@sha256:bb22d9815c728170f72750f4e5b0d672e06176142e1d602c7e66c050100b7e5b
ARG MAVEN_RELEASE=3.10.0
ARG JAVA_RELEASE=25
#25, 23, 21
ARG DISTRIBUTION=eclipse-temurin
ARG BASE_BUILDER=noble
ARG IMAGE_RUNTIME=gcr.io/distroless/base-debian13:nonroot@sha256:9039a88709bcc2bacf5a2faac331d65dd6840f763f225ad9594cc0c67bcd0fba
#ARG DISTRIBUTION=amazoncorretto
#ARG BASE_BUILDER=debian
#ARG IMAGE_RUNTIME=amazoncorretto:25-al2023-headless
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
ARG SPRING_BOOT_VERSION=4.1.2
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

# Warm dependencies (won't be busted by source changes)
RUN --mount=type=cache,id=maven-m2-spring-jvm-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -v && \
    mvn -B -q -ntp  \
      -Dspring-boot.version=${SPRING_BOOT_VERSION} -Dcheckstyle.skip=true -f tomcat/pom.xml dependency:go-offline && \
    mvn -B -q -ntp  \
      -Dspring-boot.version=${SPRING_BOOT_VERSION} -Dcheckstyle.skip=true -f netty/pom.xml  dependency:go-offline

COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle.xml checkstyle.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle-suppressions.xml checkstyle-suppressions.xml
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

RUN --mount=type=cache,id=maven-m2-spring-jvm-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
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

# ── jlink: create a stripped-down custom JRE ──
# Analyse the Spring Boot uber-jar for required JDK modules and build a minimal runtime.
# Spring Boot's nested-jar class loader hides dependencies from jdeps, so several
# modules must be added explicitly:
#   java.instrument    – required by -javaagent (OpenTelemetry agent)
#   java.logging       – OTel agent uses java.util.logging
#   java.desktop       – Spring Boot property binding needs java.beans (lives in java.desktop)
#   java.naming        – Tomcat JNDI (javax.naming.NamingException)
#   java.security.jgss – Tomcat default realm (org.ietf.jgss.GSSException)
#   jdk.management     – profiling extensions (Pyroscope) and JMX runtime info
#   jdk.jfr            – JFR-based Pyroscope profile export support
RUN set -eux; \
    DEPS=$(jdeps \
      --ignore-missing-deps \
      --print-module-deps \
      --multi-release ${JAVA_RELEASE} \
      /workspace/out/app.jar 2>/dev/null || echo "java.base") && \
    DEPS="$DEPS,java.instrument,java.logging,java.desktop,java.naming,java.security.jgss,jdk.management,jdk.jfr" && \
    echo "jlink modules: $DEPS" && \
    jlink \
      --add-modules "$DEPS" \
      --strip-debug \
      --compress zip-6 \
      --no-header-files \
      --no-man-pages \
      --output /workspace/out/jre

# ------------ OTEL/PROFILING DEPS STAGE -----------------------
FROM alpine:3.24.4@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS otel_deps

ARG OTEL_PYROSCOPE_VERSION=2.1.4
ARG OTEL_JAVA_AGENT_VERSION=2.33.1
# Reviewed release asset digests from the GitHub releases API for these versions.
# Update version/URL/filename overrides together with their matching SHA-256.
ARG OTEL_PYROSCOPE_SHA256=c91cc1b4df86633179eede381ed9df181ba100794632534b5f114661440ef075
ARG OTEL_JAVA_AGENT_SHA256=e43a270df53c6f423e0ab157be9c27ccc01d5dc3232e162fe54777573db2f149
ARG OTEL_JAVA_AGENT_FILENAME=opentelemetry-javaagent.jar
ARG OTEL_JAVA_AGENT_URL="https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_JAVA_AGENT_VERSION}/${OTEL_JAVA_AGENT_FILENAME}"
### Snapshots - prereleased:
#ARG OTEL_JAVA_AGENT_FILENAME=opentelemetry-javaagent-${OTEL_JAVA_AGENT_VERSION}-20251212.043721-77.jar
#ARG OTEL_JAVA_AGENT_URL="https://central.sonatype.com/repository/maven-snapshots/io/opentelemetry/javaagent/opentelemetry-javaagent/${OTEL_JAVA_AGENT_VERSION}-SNAPSHOT/${OTEL_JAVA_AGENT_FILENAME}"

RUN apk add --no-cache ca-certificates curl
WORKDIR /out

# Download with BuildKit cache to speed rebuilds
RUN --mount=type=cache,id=otel-deps,target=/cache,sharing=locked \
    set -eu; \
    # Validate both pins before any request or cache access. \
    for checksum in "$OTEL_PYROSCOPE_SHA256" "$OTEL_JAVA_AGENT_SHA256"; do \
      case "$checksum" in ''|*[!0-9a-fA-F]*) echo "Invalid agent SHA-256" >&2; exit 1 ;; esac; \
      [ "${#checksum}" -eq 64 ] || { echo "Invalid agent SHA-256 length" >&2; exit 1; }; \
    done; \
    DOWNLOAD_TMP=; \
    trap 'if [ -n "$DOWNLOAD_TMP" ]; then rm -f "$DOWNLOAD_TMP"; fi' EXIT; \
    trap 'exit 1' HUP INT TERM; \
    fetch_verified() { \
      DOWNLOAD_URL=$1; DOWNLOAD_CACHE=$2; DOWNLOAD_SHA256=$3; DOWNLOAD_OUTPUT=$4; \
      if [ ! -f "$DOWNLOAD_CACHE" ]; then \
        DOWNLOAD_TMP=$(mktemp "${DOWNLOAD_CACHE}.tmp.XXXXXX"); \
        curl --proto '=https' --proto-redir '=https' -fsSL --retry 5 --retry-all-errors -o "$DOWNLOAD_TMP" "$DOWNLOAD_URL"; \
        printf '%s  %s\n' "$DOWNLOAD_SHA256" "$DOWNLOAD_TMP" | sha256sum -c -; \
        mv "$DOWNLOAD_TMP" "$DOWNLOAD_CACHE"; \
        DOWNLOAD_TMP=; \
      fi; \
      cp "$DOWNLOAD_CACHE" "$DOWNLOAD_OUTPUT"; \
      # Verify the actual output bytes, including on cache hits. \
      printf '%s  %s\n' "$DOWNLOAD_SHA256" "$DOWNLOAD_OUTPUT" | sha256sum -c -; \
    }; \
    case "${OTEL_PYROSCOPE_VERSION}" in \
      0.*|1.*) PYRO_ASSET="pyroscope-otel.jar" ;; \
      *)       PYRO_ASSET="pyroscope-otel-javaagent-extension.jar" ;; \
    esac; \
    PYRO_URL="https://github.com/grafana/otel-profiling-java/releases/download/v${OTEL_PYROSCOPE_VERSION}/${PYRO_ASSET}"; \
    PYRO_CACHE="/cache/${PYRO_ASSET%.jar}-${OTEL_PYROSCOPE_VERSION}-${OTEL_PYROSCOPE_SHA256}.jar"; \
    fetch_verified "$PYRO_URL" "$PYRO_CACHE" "$OTEL_PYROSCOPE_SHA256" ./pyroscope-otel-extension.jar; \
    AGENT_CACHE="/cache/opentelemetry-javaagent-${OTEL_JAVA_AGENT_VERSION}-${OTEL_JAVA_AGENT_SHA256}.jar"; \
    fetch_verified "$OTEL_JAVA_AGENT_URL" "$AGENT_CACHE" "$OTEL_JAVA_AGENT_SHA256" ./opentelemetry-javaagent.jar

#-----------------------  RUNTIME STAGE -----------------------
# Use a minimal distroless base — the jlink JRE is self-contained
FROM  ${IMAGE_RUNTIME} AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
#ARG RUNTIME_USER=1001
#ARG RUNTIME_GROUP=1001
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"
ENV JAVA_ARGS=${JAVA_ARGS}

WORKDIR /work/

# Install ca-certificates to support healthcheck and downloads
# Create a dedicated non-root user/group (OpenShift-friendly UID/GID 1001)
#RUN dnf install -y --setopt=install_weak_deps=False shadow-utils ca-certificates \
#    && groupadd -g ${RUNTIME_GROUP} spring \
#    && useradd -u ${RUNTIME_USER} -g spring -M -d /nonexistent -s /sbin/nologin spring \
#    && mkdir -p /work /deployments \
#    && dnf clean all && rm -rf /var/cache/dnf/*

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/out/jre/ /opt/jre/
COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/out/app.jar /deployments/app.jar
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
    -XX:MaxDirectMemorySize=32M \
    -XX:MaxGCPauseMillis=200 \
    -Xms64m \
    -Xmx640m \
    --enable-native-access=ALL-UNNAMED \
    ${JAVA_ARGS}"

USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["/opt/jre/bin/java", "-jar", "/deployments/app.jar"]
