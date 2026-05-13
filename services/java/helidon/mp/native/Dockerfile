# syntax=docker/dockerfile:1.7
ARG JAVA_RELEASE=25
ARG JAVA_MINOR_RELEASE=.0.3
ARG BASE_BUILDER=ol9
ARG IMAGE_RUNTIME=gcr.io/distroless/cc-debian13:nonroot

# ------------ BUILD STAGE -----------------------
FROM container-registry.oracle.com/graalvm/native-image:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ENV JAVA_TOOL_OPTIONS="--sun-misc-unsafe-memory-access=allow -Dorg.jboss.weld.executor.threadPoolType=FIXED_TIMEOUT -Dorg.jboss.weld.executor.threadPoolSize=1"
ARG HELIDON_VERSION=4.4.1
ENV HELIDON_VERSION=${HELIDON_VERSION}

ENV LANGUAGE='en_US:en'
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 -Dmaven.artifact.threads=16"

# Memory allocated to the GraalVM native-image compiler (default ~8 GB shown; adjust as needed)
ARG NATIVE_IMAGE_MAX_HEAP=8g
ENV NATIVE_IMAGE_OPTS="-J-Xmx${NATIVE_IMAGE_MAX_HEAP}"

# Ensure UID/GID are consistent across images for cache ownership
RUN groupadd -g 1000 maven \
 && useradd  -u 1000 -g maven -d /home/maven -s /bin/sh maven \
 && mkdir -p /home/maven /workspace \
 && chown -R 1000:1000 /home/maven /workspace

USER 1000
WORKDIR /workspace

# ── Layer 1: Maven wrapper (rarely changes) ──
COPY --link --chown=1000:1000 helidon/mp/native/.mvn/ .mvn
COPY --link --chown=1000:1000 --chmod=0755 helidon/mp/native/mvnw ./mvnw
# Strip Windows CRLF in the same layer that copies the wrapper, not a separate RUN
RUN sed -i 's/\r$//' mvnw

# ── Layer 2: POM only (changes when dependencies change) ──
COPY --link --chown=1000:1000 helidon/mp/native/pom.xml pom.xml

# ── Layer 3: Dependency resolution (cached unless pom.xml changes) ──
# Cache buster for Maven/go-offline changes.
# Pass e.g. --build-arg POM_CACHE_BUSTER=$(date +%s) from the host when you need to force rebuild.
ARG POM_CACHE_BUSTER=0
RUN --mount=type=cache,id=maven-m2-helidon-mp-native-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    echo "POM_CACHE_BUSTER=${POM_CACHE_BUSTER}" && \
    ./mvnw -v && \
    ./mvnw -B -q -ntp  \
    -Dhelidon.version=${HELIDON_VERSION} \
    -Dcheckstyle.skip=true \
    dependency:go-offline

# ── Layer 3b: Checkstyle config (changes rarely) ──
COPY --link --chown=1000:1000 checkstyle.xml checkstyle.xml
COPY --link --chown=1000:1000 checkstyle-suppressions.xml checkstyle-suppressions.xml

# ── Layer 4: Resources (change less often than Java sources) ──
# Copy JVM resources first, then overlay native-only resources.
COPY --link --chown=1000:1000 helidon/mp/jvm/src/main/resources/ ./src/main/resources/
COPY --link --chown=1000:1000 helidon/mp/native/src/main/resources/ ./src/main/resources/

# ── Layer 5: Java sources (change most often) ──
# Shared sources from helidon/mp/jvm, then native-only GraalVM substitutions overlaid.
COPY --link --chown=1000:1000 helidon/mp/jvm/src/main/java/ ./src/main/java/
COPY --link --chown=1000:1000 helidon/mp/native/src/main/java/ ./src/main/java/
# Test sources
COPY --link --chown=1000:1000 helidon/mp/jvm/src/test/ ./src/test/

# ── Layer 6: Native-image build ──
# Declare NATIVE_IMAGE_* ARGs late so changes don't invalidate dependency/source layers.
# Allow native-image init directives to be tuned from docker build args.
# Pass as comma-separated packages/classes (no spaces), e.g.
#   --build-arg NATIVE_IMAGE_INIT_BUILD_TIME=io.helidon.common.mapper.spi,org.eclipse.parsson
#   --build-arg NATIVE_IMAGE_INIT_RUN_TIME=io.helidon.microprofile.cdi.BuildTimeInitializer
# Default is empty because WeldProxyBuildTimeInitFeature now dynamically discovers
# and registers all Weld client proxy classes for build-time init.  Pass additional
# classes here only if needed for non-Weld proxy types.
ARG NATIVE_IMAGE_INIT_BUILD_TIME=""
ARG NATIVE_IMAGE_INIT_RUN_TIME=""
# Raw extra native-image args (space-separated). Use for quick experimentation.
ARG NATIVE_IMAGE_EXTRA_ARGS=""

RUN --mount=type=cache,id=maven-m2-helidon-mp-native-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    --mount=type=cache,id=native-target-${JAVA_RELEASE},target=/workspace/target,uid=1000,gid=1000,mode=0775,sharing=locked \
    rm -rf target/classes target/generated-sources target/generated-test-sources target/maven-status \
           target/test-classes target/reports target/*.jar target/helidon-mp-native && \
    EXTRA_OPTS="" && \
    if [ -n "${NATIVE_IMAGE_INIT_BUILD_TIME}" ] || [ -n "${NATIVE_IMAGE_INIT_RUN_TIME}" ] || [ -n "${NATIVE_IMAGE_EXTRA_ARGS}" ]; then \
      EXTRA_OPTS="-Dnative.image.init.build.time.extra=${NATIVE_IMAGE_INIT_BUILD_TIME} -Dnative.image.init.run.time.extra=${NATIVE_IMAGE_INIT_RUN_TIME} -Dnative.image.args.extra=${NATIVE_IMAGE_EXTRA_ARGS}"; \
    fi && \
    ./mvnw -B -ntp -T 1C \
      -Dhelidon.version=${HELIDON_VERSION} \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml \
      -Dnative \
      ${EXTRA_OPTS} \
      package && \
    cp target/helidon-mp-native /workspace/helidon-mp-native && \
    chmod 0555 /workspace/helidon-mp-native

#-----------------------  RUNTIME STAGE -----------------------
FROM ${IMAGE_RUNTIME} AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}

WORKDIR /native

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} /workspace/src/main/resources/application.yaml /native/application.yaml

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/helidon-mp-native /native/helidon-mp-native
EXPOSE 8080
USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["./helidon-mp-native"]
