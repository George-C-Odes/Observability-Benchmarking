# syntax=docker/dockerfile:1.7
ARG JAVA_RELEASE=25
ARG JAVA_MINOR_RELEASE=.0.2
ARG BASE_BUILDER=ol9
ARG IMAGE_RUNTIME=gcr.io/distroless/cc-debian13:nonroot

# ------------ BUILD STAGE -----------------------
FROM container-registry.oracle.com/graalvm/native-image:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ENV JAVA_TOOL_OPTIONS="--sun-misc-unsafe-memory-access=allow -Dorg.jboss.weld.executor.threadPoolType=FIXED_TIMEOUT -Dorg.jboss.weld.executor.threadPoolSize=1"
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

# ── Debug (temporary): print Weld bootstrap signatures for diagnostics ──
# Placed after the build so it doesn't block source-layer caching.
RUN --mount=type=cache,id=maven-m2-helidon-mp-native-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    set -eux; \
    JAR="/home/maven/.m2/io/helidon/microprofile/weld/weld-core-impl/${HELIDON_VERSION}/weld-core-impl-${HELIDON_VERSION}.jar"; \
    test -f "$JAR"; \
    echo "[debug] Inspecting $JAR"; \
    /usr/lib64/graalvm/graalvm-java${JAVA_RELEASE}/bin/javap -classpath "$JAR" -p org.jboss.weld.bootstrap.events.ContainerLifecycleEventPreloader \
      | tee /workspace/weld-preloader-javap.txt \
      | sed -n '1,220p'; \
    /usr/lib64/graalvm/graalvm-java${JAVA_RELEASE}/bin/javap -classpath "$JAR" -p org.jboss.weld.bootstrap.events.ContainerLifecycleEvents \
      | tee /workspace/weld-events-javap.txt \
      | sed -n '1,260p'

#-----------------------  RUNTIME STAGE -----------------------
FROM ${IMAGE_RUNTIME} AS runner
ARG RUNTIME_USER=nonroot
ARG RUNTIME_GROUP=nonroot
ENV RUNTIME_USER=${RUNTIME_USER}
ENV RUNTIME_GROUP=${RUNTIME_GROUP}

WORKDIR /native

# Weld's RegistrySingletonProvider isn't instantiable via Class#newInstance in native image.
# Force Weld to use the default singleton provider implementation.
# (This is a system property consumed by Weld during boot.)
#
# Note: Weld reads the provider class from system property key
#   org.jboss.weld.bootstrap.api.helpers.SingletonProvider

# Weld native-image workaround:
# Disable container lifecycle event preloading which can NPE in native mode.
# (Matches stacktrace: ContainerLifecycleEvents.preloadProcessInjectionTarget -> ContainerLifecycleEventPreloader)

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} /workspace/weld-preloader-javap.txt /native/weld-preloader-javap.txt
COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} /workspace/weld-events-javap.txt /native/weld-events-javap.txt

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} /workspace/src/main/resources/application.yaml /native/application.yaml

# Make Weld native flags apply to the native executable at runtime.
# Distroless doesn't have a shell, so we pass these as args, not via sh -c.
#
# NOTE: These are runtime flags, not native-image build args.

COPY --from=builder --chown=${RUNTIME_USER}:${RUNTIME_GROUP} --chmod=0555 /workspace/helidon-mp-native /native/helidon-mp-native
EXPOSE 8080
USER ${RUNTIME_USER}:${RUNTIME_GROUP}
ENTRYPOINT ["./helidon-mp-native", "-Dorg.jboss.weld.bootstrap.api.helpers.SingletonProvider=org.jboss.weld.bootstrap.api.helpers.Singletons", "-Dorg.jboss.weld.bootstrap.events.ContainerLifecycleEvents.PRELOAD_PROCESS_INJECTION_TARGET=false"]