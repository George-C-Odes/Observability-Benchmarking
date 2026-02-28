# syntax=docker/dockerfile:1.7
ARG JAVA_RELEASE=25
ARG JAVA_MINOR_RELEASE=.0.2
ARG BASE_BUILDER=ol9
ARG IMAGE_RUNTIME=gcr.io/distroless/cc-debian13:nonroot

# ------------ BUILD STAGE -----------------------
FROM container-registry.oracle.com/graalvm/native-image:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ENV JAVA_TOOL_OPTIONS="--sun-misc-unsafe-memory-access=allow"
ARG HELIDON_VERSION=4.3.4
ENV HELIDON_VERSION=${HELIDON_VERSION}
ENV LANGUAGE='en_US:en'
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 -Dmaven.artifact.threads=16"

# Ensure UID/GID are consistent across images for cache ownership
RUN groupadd -g 1000 maven \
 && useradd  -u 1000 -g maven -d /home/maven -s /bin/sh maven \
 && mkdir -p /home/maven /workspace \
 && chown -R 1000:1000 /home/maven /workspace

USER 1000
WORKDIR /workspace

COPY --link --chown=1000:1000 helidon/se/native/.mvn/ .mvn
COPY --link --chown=1000:1000 helidon/se/native/mvnw ./mvnw
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
COPY --link --chown=1000:1000 helidon/se/native/pom.xml pom.xml

RUN --mount=type=cache,id=maven-m2-helidon-se-native-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    ./mvnw -v && \
    ./mvnw -B -q -ntp  \
    -Dhelidon.version=${HELIDON_VERSION} \
    -Dcheckstyle.skip=true \
    dependency:go-offline

COPY --link --chown=1000:1000 checkstyle.xml checkstyle.xml
COPY --link --chown=1000:1000 checkstyle-suppressions.xml checkstyle-suppressions.xml

# Shared sources live in helidon/se/jvm; native module reuses them via build-helper
COPY --link --chown=1000:1000 helidon/se/jvm/src ./src

RUN --mount=type=cache,id=maven-m2-helidon-se-native-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    ./mvnw -B -ntp -T 1C \
      -Dhelidon.version=${HELIDON_VERSION} \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml \
      -Dnative \
      package

RUN set -eux; \
    BIN="target/helidon-se-native"; \
    test -f "$BIN"; \
    cp "$BIN" /workspace/helidon-se-native; \
    chmod 0555 /workspace/helidon-se-native

#-----------------------  RUNTIME STAGE -----------------------
FROM ${IMAGE_RUNTIME} AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}

WORKDIR /native

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} /workspace/src/main/resources/application.yaml /native/application.yaml

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/helidon-se-native /native/helidon-se-native
EXPOSE 8080
USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["./helidon-se-native"]