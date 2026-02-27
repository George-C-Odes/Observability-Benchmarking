# syntax=docker/dockerfile:1.7
ARG MAVEN_RELEASE=3.9.12
ARG JAVA_RELEASE=25
ARG DISTRIBUTION=eclipse-temurin
ARG BASE_BUILDER=noble
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"

# ------------ BUILD STAGE -----------------------
FROM maven:${MAVEN_RELEASE}-${DISTRIBUTION}-${JAVA_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV JAVA_TOOL_OPTIONS=${JAVA_ARGS}
ENV LANGUAGE='en_US:en'
ARG HELIDON_VERSION=4.3.4
ENV HELIDON_VERSION=${HELIDON_VERSION}
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 -Dmaven.artifact.threads=16"
ARG BUILD_UID=1000
ARG BUILD_GID=1000

RUN set -eux; \
    if ! getent group "${BUILD_GID}" >/dev/null; then groupadd -g "${BUILD_GID}" maven; fi; \
    if ! getent passwd "${BUILD_UID}" >/dev/null; then useradd -u "${BUILD_UID}" -g "${BUILD_GID}" -m -d /home/maven -s /bin/sh maven; fi; \
    mkdir -p /home/maven /workspace; \
    chown -R "${BUILD_UID}:${BUILD_GID}" /home/maven /workspace

USER ${BUILD_UID}:${BUILD_GID}
WORKDIR /workspace

COPY --link --chown=${BUILD_UID}:${BUILD_GID} helidon/se/jvm/pom.xml pom.xml

RUN --mount=type=cache,id=maven-m2-helidon-se-jvm-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -v && \
    mvn -B -q -ntp  \
    -Dhelidon.version=${HELIDON_VERSION} \
    -Dcheckstyle.skip=true \
    dependency:go-offline

COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle.xml checkstyle.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle-suppressions.xml checkstyle-suppressions.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} helidon/se/jvm/src ./src

# Build the shaded uber-jar, then create a custom JRE via jlink
RUN --mount=type=cache,id=maven-m2-helidon-se-jvm-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -B -ntp -T 1C \
      -Dhelidon.version=${HELIDON_VERSION} \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml \
      package && \
    mkdir -p /workspace/out && \
    JAR="target/helidon-se-jvm-1.0.0-SNAPSHOT.jar" && \
    test -f "$JAR" && cp "$JAR" /workspace/out/app.jar

# ── jlink: create a stripped-down custom JRE ──
# Analyse the shaded uber-jar for required JDK modules and build a minimal runtime.
RUN set -eux; \
    DEPS=$(jdeps \
      --ignore-missing-deps \
      --print-module-deps \
      --multi-release ${JAVA_RELEASE} \
      /workspace/out/app.jar 2>/dev/null || echo "java.base") && \
    echo "jlink modules: $DEPS" && \
    jlink \
      --add-modules "$DEPS" \
      --strip-debug \
      --compress zip-6 \
      --no-header-files \
      --no-man-pages \
      --output /workspace/out/jre

#-----------------------  RUNTIME STAGE -----------------------
# Use a minimal distroless base — the jlink JRE is self-contained
FROM gcr.io/distroless/base-debian13:nonroot AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"
ENV JAVA_ARGS=${JAVA_ARGS}

WORKDIR /work/

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/out/jre/ /opt/jre/
COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/out/app.jar /deployments/app.jar

EXPOSE 8080

ENV JAVA_TOOL_OPTIONS="\
    -Djava.security.egd=file:/dev/./urandom \
    -Djdk.tracePinnedThreads=full \
    -XX:+UnlockDiagnosticVMOptions \
    -XX:+AlwaysPreTouch \
    -XX:+ExitOnOutOfMemoryError \
    -XX:+UseContainerSupport \
    -XX:+UseG1GC \
    -XX:ActiveProcessorCount=2 \
    -XX:G1HeapRegionSize=1m \
    -XX:G1ReservePercent=20 \
    -XX:MaxDirectMemorySize=32M \
    -XX:MaxGCPauseMillis=200 \
    -Xms96m \
    -Xmx96m \
    --enable-native-access=ALL-UNNAMED \
    ${JAVA_ARGS}"

USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["/opt/jre/bin/java", "-jar", "/deployments/app.jar"]
