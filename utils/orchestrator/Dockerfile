# syntax=docker/dockerfile:1.7
ARG IMAGE_BUILDER=maven:3.9.12-eclipse-temurin-25-noble
ARG IMAGE_DOCKER_CLI=docker:29.1.3-cli
ARG IMAGE_RUNTIME=gcr.io/distroless/java25-debian13:nonroot
# ------------ BUILD STAGE -----------------------
FROM ${IMAGE_BUILDER} AS builder
ARG BUILD_UID=1000
ARG BUILD_GID=1000
ENV JAVA_TOOL_OPTIONS="--sun-misc-unsafe-memory-access=allow"
ENV LANGUAGE='en_US:en'
ENV QUARKUS_NATIVE_ENABLED=false
ENV HOME=/home/maven
ENV MAVEN_REPO=/home/maven/.m2/repository
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${MAVEN_REPO} -Dmaven.artifact.threads=16"

# Create/ensure user (reuses existing GID if noble already has 1000)
RUN set -eux; \
    if ! getent group "${BUILD_GID}" >/dev/null; then groupadd -g "${BUILD_GID}" maven; fi; \
    if ! getent passwd "${BUILD_UID}" >/dev/null; then useradd -u "${BUILD_UID}" -g "${BUILD_GID}" -m -d /home/maven -s /bin/sh maven; fi; \
    mkdir -p /workspace "${MAVEN_REPO}"; \
    chown -R "${BUILD_UID}:${BUILD_GID}" /home/maven /workspace

USER ${BUILD_UID}:${BUILD_GID}
WORKDIR /workspace

# Keep cache-friendly layering
COPY --link --chown=${BUILD_UID}:${BUILD_GID} pom.xml pom.xml
RUN --mount=type=cache,id=maven-repo,target=/home/maven/.m2/repository,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
  mvn -B -ntp -DskipTests dependency:go-offline

COPY --link --chown=${BUILD_UID}:${BUILD_GID} src ./src
RUN --mount=type=cache,id=maven-repo,target=/home/maven/.m2/repository,uid=${BUILD_UID},gid=${BUILD_GID},mode=0775,sharing=locked \
  mvn -B -ntp -DskipTests -T 1C \
    -Dquarkus.package.jar.type=fast-jar \
    package

# ------------ DOCKER CLI STAGE (prep perms here, not in distroless) -----------------------
FROM ${IMAGE_DOCKER_CLI} AS docker_cli
# Copy only what we need (docker + compose/buildx plugins) and ensure executable bits
RUN set -eux; \
    mkdir -p /out/cli-plugins; \
    cp -v /usr/local/bin/docker /out/docker; \
    chmod 0555 /out/docker; \
    for name in docker-compose docker-buildx; do \
      found=""; \
      for d in \
        /usr/local/lib/docker/cli-plugins \
        /usr/libexec/docker/cli-plugins \
        /usr/local/libexec/docker/cli-plugins \
        /usr/lib/docker/cli-plugins \
      ; do \
        if [ -f "$d/$name" ]; then \
          cp -v "$d/$name" "/out/cli-plugins/$name"; \
          chmod 0555 "/out/cli-plugins/$name"; \
          found="yes"; break; \
        fi; \
      done; \
      if [ -z "$found" ]; then echo "WARN: plugin $name not found in expected locations"; fi; \
    done

#-----------------------  RUNTIME STAGE -----------------------
FROM ${IMAGE_RUNTIME} AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}
ENV JAVA_TOOL_OPTIONS="\
    -Djava.security.egd=file:/dev/./urandom \
    -XX:MaxRAMPercentage=75 \
    -XX:+ExitOnOutOfMemoryError \
    -XX:+UseContainerSupport \
    -Xlog:gc+init=info \
    -Xlog:gc+exit=info \
    --enable-native-access=ALL-UNNAMED \
    --sun-misc-unsafe-memory-access=allow"

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} /workspace/target/quarkus-app/ /app/quarkus-app/
COPY --from=docker_cli --chmod=0555 /out/docker /usr/local/bin/docker
COPY --from=docker_cli --chmod=0555 /out/cli-plugins/ /usr/local/lib/docker/cli-plugins/

EXPOSE 8080
WORKDIR /app
USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["java","-jar","/app/quarkus-app/quarkus-run.jar"]