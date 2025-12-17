ARG DISTRIBUTION=amazoncorretto
ARG JAVA_RELEASE=25
ARG JAVA_MINOR_RELEASE=.0.1
ARG BASE_BUILDER=debian
ARG BASE_RUNTIME=al2023-headless
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"

FROM maven:3.9.11-${DISTRIBUTION}-${JAVA_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV JAVA_TOOL_OPTIONS=${JAVA_ARGS}
ARG MICRONAUT_VERSION=4.10.5
ENV MICRONAUT_VERSION=${MICRONAUT_VERSION}
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME}"

RUN groupadd -r maven \
 && useradd -r -g maven -d /home/maven -s /bin/sh maven \
 && mkdir -p /home/maven \
 && chown -R maven:maven /home/maven

COPY --chown=maven:maven micronaut/jvm/pom.xml /code/
USER maven
WORKDIR /code

RUN mvn -v && mvn -B \
  -Duser.home=${HOME} \
  -Dmaven.repo.local=${HOME}/.m2 \
  dependency:go-offline

COPY micronaut/jvm/src /code/src
COPY checkstyle.xml /code/checkstyle.xml
COPY checkstyle-suppressions.xml /code/checkstyle-suppressions.xml

RUN mvn -B \
  -Duser.home=${HOME} \
  -Dmaven.repo.local=${HOME}/.m2 clean package \
  -Dmaven.compiler.release=${JAVA_RELEASE} \
  -Dcheckstyle.config.location=checkstyle.xml \
  -Dcheckstyle.suppressions.location=checkstyle-suppressions.xml

FROM ${DISTRIBUTION}:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_RUNTIME} AS runtime
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}

WORKDIR /work/

# Install curl & ca-certificates, create non-root user
RUN mkdir -p /deployments /otel /work \
    && dnf install -y --setopt=install_weak_deps=False \
      shadow-utils \
    && update-ca-trust \
    && groupadd -g 1001 micronaut \
    && useradd -u 1001 -g micronaut -M -d /nonexistent -s /sbin/nologin micronaut \
    && dnf clean all && rm -rf /var/cache/dnf/*

WORKDIR /work

# Copy application JAR (uber-jar from shade plugin)
COPY --from=builder --chown=1001:1001 /code/target/micronaut-jvm-1.0.0-SNAPSHOT.jar /deployments/app.jar

# Download OpenTelemetry Java agent
ARG OTEL_PYROSCOPE_VERSION=1.0.4
ADD https://github.com/grafana/otel-profiling-java/releases/download/v${OTEL_PYROSCOPE_VERSION}/pyroscope-otel.jar /work/pyroscope-otel-extension.jar
RUN chown 1001:1001 /work/pyroscope-otel-extension.jar; \
    chmod 0640 /work/pyroscope-otel-extension.jar

ARG OTEL_JAVA_AGENT_VERSION=2.23.0
ARG OTEL_JAVA_AGENT_FILENAME=opentelemetry-javaagent.jar
ARG OTEL_JAVA_AGENT_URL="https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_JAVA_AGENT_VERSION}/${OTEL_JAVA_AGENT_FILENAME}"
RUN --mount=type=cache,target=/otel-agent-cache \
    set -e; \
    mkdir -p /work /otel-agent-cache/opentelemetry-javaagent/${OTEL_JAVA_AGENT_VERSION}; \
    LOCAL_JAR="/otel-agent-cache/opentelemetry-javaagent/${OTEL_JAVA_AGENT_VERSION}/${OTEL_JAVA_AGENT_FILENAME}"; \
    IMAGE_JAR="/work/opentelemetry-javaagent.jar"; \
    if [ -f "$LOCAL_JAR" ]; then \
      echo "Reusing OpenTelemetry Java agent from BuildKit cache: $LOCAL_JAR"; \
    else \
      echo "OpenTelemetry Java agent not found in cache, downloading from ${OTEL_JAVA_AGENT_URL}"; \
      curl -fsSL --retry 5 --retry-all-errors --http1.1 \
        -o "$LOCAL_JAR" \
        "${OTEL_JAVA_AGENT_URL}"; \
    fi; \
    cp "$LOCAL_JAR" "$IMAGE_JAR" \
 && chown 1001:1001 /work/opentelemetry-javaagent.jar \
 && chmod 0640 /work/opentelemetry-javaagent.jar

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
    -XX:MaxDirectMemorySize=256m \
    -XX:MaxGCPauseMillis=200 \
    -Xms1536m \
    -Xmx1536m \
    -Xlog:class+path=info \
    -Xlog:gc+init=info \
    -Xlog:gc+exit=info \
    --enable-native-access=ALL-UNNAMED \
    ${JAVA_ARGS}"

RUN chown -R micronaut:micronaut /deployments /otel /work \
  && chmod -R g+rX,o-rwx /deployments /otel /work

# Run as non-root user
USER 1001

ENTRYPOINT ["java", "-jar", "/deployments/app.jar"]
