# syntax=docker/dockerfile:1.7
ARG MAVEN_RELEASE=3.9.12
ARG JAVA_RELEASE=25
#25, 23, 21
ARG DISTRIBUTION=eclipse-temurin
ARG BASE_BUILDER=noble
ARG IMAGE_RUNTIME=gcr.io/distroless/java25-debian13:nonroot
#ARG DISTRIBUTION=amazoncorretto
#ARG BASE_BUILDER=debian
#ARG IMAGE_RUNTIME=amazoncorretto:25.0.2-al2023-headless
#jre-ubi10-minimal, alpine, al2023-headless
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
ARG QUARKUS_VERSION=3.31.3
ENV QUARKUS_VERSION=${QUARKUS_VERSION}
ENV QUARKUS_NATIVE_ENABLED=false
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 -Dmaven.artifact.threads=16"
ARG BUILD_UID=1000
ARG BUILD_GID=1000

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

COPY --link --chown=${BUILD_UID}:${BUILD_GID} quarkus/jvm/pom.xml pom.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle.xml checkstyle.xml
COPY --link --chown=${BUILD_UID}:${BUILD_GID} checkstyle-suppressions.xml checkstyle-suppressions.xml

# Warm dependencies (won't be busted by source changes)
RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -v &&  \
    mvn -B -q -ntp \
      -Dquarkus.platform.version=${QUARKUS_VERSION} \
      dependency:go-offline

COPY --link --chown=${BUILD_UID}:${BUILD_GID} quarkus/jvm/src ./src

RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
    mvn -B -ntp -T 1C \
      -Dquarkus.platform.version=${QUARKUS_VERSION} \
      -Dquarkus.package.jar.type=fast-jar \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml \
      package
#-DskipTests
#uber-jar

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
ENV QUARKUS_HTTP_HOST=0.0.0.0
ENV QUARKUS_HTTP_PORT=8080

WORKDIR /work

# Install ca-certificates to support healthcheck and downloads
# Create a dedicated non-root user/group (OpenShift-friendly UID/GID 1001)
#RUN dnf install -y --setopt=install_weak_deps=False shadow-utils ca-certificates \
#    && groupadd -g ${RUNTIME_GROUP} quarkus \
#    && useradd -u ${RUNTIME_USER} -g quarkus -M -d /nonexistent -s /sbin/nologin quarkus \
#    && mkdir -p /work /deployments \
#    && dnf clean all && rm -rf /var/cache/dnf/*

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/target/quarkus-app/ /deployments/

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
ENTRYPOINT ["java", "-jar", "/deployments/quarkus-run.jar"]