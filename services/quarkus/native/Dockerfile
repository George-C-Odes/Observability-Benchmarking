# syntax=docker/dockerfile:1.7
ARG DISTRIBUTION=mandrel
#mandrel, graalvmce
ARG JAVA_RELEASE=25
#(J21 crashes on virtual threads)
ARG JAVA_MINOR_RELEASE=.0.1
ARG BASE_BUILDER=ol10
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"
#For J25 set "--sun-misc-unsafe-memory-access=allow" for suppressing warnings, N/A for J21
# ------------ BUILD STAGE -----------------------
#FROM quay.io/quarkus/ubi9-quarkus-${DISTRIBUTION}-builder-image:jdk-${JAVA_RELEASE} AS builder
FROM container-registry.oracle.com/graalvm/native-image:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV JAVA_TOOL_OPTIONS=${JAVA_ARGS}
ARG QUARKUS_VERSION=3.30.4
ENV QUARKUS_VERSION=${QUARKUS_VERSION}
ENV LANGUAGE='en_US:en'
ENV QUARKUS_NATIVE_ENABLED=true
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 -Dmaven.artifact.threads=16"
ENV QUARKUS_NATIVE_ADDITIONAL_BUILD_ARGS="\
-H:+UnlockExperimentalVMOptions,\
-H:+PreserveFramePointer,\
-H:-DeleteLocalSymbols,\
-H:-StripDebugInfo,\
-H:GenerateDebugInfo=1,\
-J--add-opens=java.base/java.lang=ALL-UNNAMED,\
-J--add-opens=java.base/java.lang.invoke=ALL-UNNAMED,\
-J--sun-misc-unsafe-memory-access=allow,\
-R:+AlwaysPreTouch,\
-R:MaxGCPauseMillis=200,\
-R:MaxDirectMemorySize=64m,\
-R:MaxHeapSize=1280m,\
-R:MinHeapSize=1280m,\
-march=native,\
--enable-native-access=ALL-UNNAMED,\
--enable-monitoring=heapdump\\,jfr,\
--initialize-at-build-time=jdk.nio.zipfs.ZipFileSystemProvider\\,jdk.nio.zipfs.ZipFileSystem\\,sun.nio.fs.LinuxFileSystemProvider\\,sun.nio.fs.LinuxFileSystem,\
--initialize-at-run-time=org.fusesource.jansi.internal,\
--link-at-build-time=ALL,\
--future-defaults=all,\
--gc=G1,\
--verbose,\
-H:-UnlockExperimentalVMOptions"
#--initialize-at-build-time=io.micrometer,\
#-R is the equvalent of jvm -XX
#EE base image Oracle GraalVM Enterprise on Linux amd64/aarch64 ->
#https://www.graalvm.org/latest/reference-manual/native-image/optimizations-and-performance/MemoryManagement/#g1-garbage-collector
#--gc=G1,\  #'G1' is not an accepted value for non EE. Accepted values are 'epsilon', 'serial'.
#-R:+AlwaysPreTouch,\
#-R:MaxGCPauseMillis=200,\
#--initialize-at-run-time=org.fusesource.jansi.internal,\
#OPTIONAL:
#-Ob,\
#--pgo,\

# Ensure UID/GID are consistent across images for cache ownership
RUN groupadd -g 1000 maven \
 && useradd  -u 1000 -g maven -d /home/maven -s /bin/sh maven \
 && mkdir -p /home/maven /workspace \
 && chown -R 1000:1000 /home/maven /workspace

USER 1000
WORKDIR /workspace

COPY --link --chown=1000:1000 quarkus/native/.mvn/ .mvn
COPY --link --chown=1000:1000 quarkus/native/mvnw ./mvnw
RUN chmod +x mvnw
COPY --link --chown=1000:1000 quarkus/native/pom.xml pom.xml
COPY --link --chown=1000:1000 checkstyle.xml checkstyle.xml
COPY --link --chown=1000:1000 checkstyle-suppressions.xml checkstyle-suppressions.xml

# Warm dependencies (won't be busted by source changes)
RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
    ./mvnw -v && \
    ./mvnw -B -q -ntp \
      -Dquarkus.platform.version=${QUARKUS_VERSION}  \
      dependency:go-offline

COPY --link --chown=1000:1000 quarkus/jvm/src ./src

# Build and Verify the native executable works
RUN --mount=type=cache,id=maven-m2-${JAVA_RELEASE},target=/home/maven/.m2,uid=1000,gid=1000,mode=0775,sharing=locked \
  ./mvnw -B -ntp verify -Dnative \
      -Dquarkus.platform.version=${QUARKUS_VERSION} \
      -Dmaven.compiler.release=${JAVA_RELEASE} \
      -Dcheckstyle.config.location=checkstyle.xml \
      -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml

# Make the output deterministic: copy the produced runner to a fixed path
RUN set -eux; \
    RUNNER="$(ls -1 target/*-runner | head -n 1)"; \
    test -n "$RUNNER"; \
    cp "$RUNNER" /workspace/quarkus-native; \
    chmod 0555 /workspace/quarkus-native

#-----------------------  RUNTIME STAGE -----------------------
#FROM quay.io/quarkus/ubi9-quarkus-micro-image:2.0
#FROM gcr.io/distroless/base-debian13
FROM debian:13.2-slim AS runner
ENV QUARKUS_HTTP_HOST=0.0.0.0
ENV QUARKUS_HTTP_PORT=8080

WORKDIR /native

# Install ca-certificates to support healthcheck and downloads
# Create a dedicated non-root user/group (OpenShift-friendly UID/GID 1001)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates adduser \
 && rm -rf /var/lib/apt/lists/* \
 && addgroup --gid 1001 quarkus \
 && adduser  --uid 1001 --gid 1001 \
            --home /nonexistent --no-create-home \
            --shell /usr/sbin/nologin --disabled-password --gecos "" quarkus

COPY --from=builder --chown=1001:1001 --chmod=0555 /workspace/quarkus-native /native/quarkus-native

EXPOSE 8080

USER 1001

# Enable JFR for native executables
# Mandrel does not support Flight Recorder options, 'Error: Could not find option 'FlightRecorder' from 'user'. Use -H:PrintFlags= to list all available options.'
# https://www.graalvm.org/latest/reference-manual/native-image/debugging-and-diagnostics/JFR/
#ENTRYPOINT ["./quarkus-native", "-XX:+FlightRecorder", "-XX:StartFlightRecording=disk=true,filename=/tmp/recording.jfr,settings=profile,dumponexit=true,maxsize=100M,maxage=1h", "XX:FlightRecorderOptions=repository=/tmp/jfr"]
ENTRYPOINT ["./quarkus-native"]