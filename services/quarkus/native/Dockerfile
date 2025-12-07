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

# create missing quarkus user for enterprise image builder
RUN useradd -m -u 1001 quarkus
USER quarkus

COPY --chown=quarkus:quarkus --chmod=0755 native/mvnw /code/mvnw
COPY --chown=quarkus:quarkus native/.mvn /code/.mvn
COPY --chown=quarkus:quarkus native/pom.xml /code/pom.xml
USER quarkus
WORKDIR /code

ARG PROFILE=stage
ENV QUARKUS_PROFILE=${PROFILE}
ENV LANGUAGE='en_US:en'
ENV QUARKUS_NATIVE_ENABLED=true
ENV OTEL_SDK_DISABLED=true
ARG QUARKUS_NATIVE_ADDITIONAL_BUILD_ARGS="\
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

RUN ./mvnw -v
RUN ./mvnw dependency:go-offline -B
COPY jvm/src /code/src

# Build and Verify the native executable works # NOTE: Avoid passing JVM heap flags in additional-build-args; use quarkus.native.native-image-xmx instead.
RUN ./mvnw verify -Dnative \
    -Dquarkus.profile=${QUARKUS_PROFILE} \
    -Dquarkus.native.native-image-xmx=10g \
    -Dquarkus.native.debug.enabled=true \
    -Dquarkus.native.monitoring=jfr \
    -Dmaven.artifact.threads=16 \
    -Dmaven.compiler.release=${JAVA_RELEASE}

#-----------------------  RUNTIME STAGE -----------------------
#FROM quay.io/quarkus/ubi9-quarkus-micro-image:2.0
FROM debian:13.2-slim AS runner
#FROM gcr.io/distroless/base-debian13
WORKDIR /native/
COPY --from=builder /code/target/*-runner /native/quarkus-native

RUN chmod 775 /native /native/quarkus-native \
  && chown -R 1001 /native \
  && chmod -R "g+rwX" /native \
  && chown -R 1001:root /native \
  && if command -v microdnf > /dev/null 2>&1; then \
      microdnf install -y curl && microdnf clean all; \
    elif command -v dnf > /dev/null 2>&1; then \
      dnf install -y curl && dnf clean all; \
    elif command -v yum > /dev/null 2>&1; then \
      yum install -y curl && yum clean all; \
    else \
      echo "No package manager found! curl not installed"; \
    fi

EXPOSE 8080
# Add a Docker HEALTHCHECK that probes the Quarkus readiness endpoint using curl.
#HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
#  CMD ["curl", "-f", "http://127.0.0.1:8080/q/health/ready"]
# non-root user (UID 1001 is OpenShift-friendly)
USER 1001

ARG PROFILE=stage
ENV QUARKUS_HTTP_HOST=0.0.0.0
ENV QUARKUS_HTTP_PORT=8080
ENV QUARKUS_PROFILE=${PROFILE}
# Enable JFR for native executables
# Mandrel does not support Flight Recorder options, 'Error: Could not find option 'FlightRecorder' from 'user'. Use -H:PrintFlags= to list all available options.'
# https://www.graalvm.org/latest/reference-manual/native-image/debugging-and-diagnostics/JFR/
#ENTRYPOINT ["./quarkus-native", "-XX:+FlightRecorder", "-XX:StartFlightRecording=disk=true,filename=/tmp/recording.jfr,settings=profile,dumponexit=true,maxsize=100M,maxage=1h", "XX:FlightRecorderOptions=repository=/tmp/jfr"]
ENTRYPOINT ["./quarkus-native"]