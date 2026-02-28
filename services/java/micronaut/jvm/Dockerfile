# syntax=docker/dockerfile:1.7
ARG MAVEN_RELEASE=3.9.12
ARG JAVA_RELEASE=25
ARG DISTRIBUTION=eclipse-temurin
ARG BASE_BUILDER=noble
ARG IMAGE_RUNTIME=gcr.io/distroless/java25-debian13:nonroot
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"

# ------------ BUILD STAGE -----------------------
FROM maven:${MAVEN_RELEASE}-${DISTRIBUTION}-${JAVA_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV JAVA_TOOL_OPTIONS=${JAVA_ARGS}
ENV LANGUAGE='en_US:en'
ARG MICRONAUT_VERSION=4.10.16
ENV MICRONAUT_VERSION=${MICRONAUT_VERSION}
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

COPY --link --chown=${BUILD_UID}:${BUILD_GID} micronaut/jvm/pom.xml pom.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle.xml checkstyle.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle-suppressions.xml checkstyle-suppressions.xml

RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -v && \
    mvn -B -q -ntp  \
    -Dmicronaut.version=${MICRONAUT_VERSION} \
    dependency:go-offline

COPY --link --chown=${BUILD_UID}:${BUILD_GID} micronaut/jvm/src ./src

RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -B -ntp -T 1C \
      -Dmicronaut.version=${MICRONAUT_VERSION} \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml \
      package && \
    mkdir -p /workspace/out && \
    JAR="target/micronaut-jvm-1.0.0-SNAPSHOT.jar" && \
    test -f "$JAR" && cp "$JAR" /workspace/out/app.jar

#-----------------------  RUNTIME STAGE -----------------------
FROM  ${IMAGE_RUNTIME} AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}

WORKDIR /work/

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/out/ /deployments/

EXPOSE 8080

ENV JAVA_TOOL_OPTIONS="\
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
    -Xms1536m \
    -Xmx1536m \
    --enable-native-access=ALL-UNNAMED \
    ${JAVA_ARGS}"

USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["java", "-jar", "/deployments/app.jar"]
