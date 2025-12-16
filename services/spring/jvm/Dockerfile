ARG DISTRIBUTION=amazoncorretto
#amazoncorretto, eclipse-temurin
ARG JAVA_RELEASE=25
#25, 23, 21
ARG JAVA_MINOR_RELEASE=.0.1
ARG BASE_BUILDER=debian
#noble, alpine, debian
ARG BASE_RUNTIME=al2023-headless
#jre-ubi10-minimal, alpine, jvm-quarkus-img:stage
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"
#For J25 set "--sun-misc-unsafe-memory-access=allow" for suppressing warnings, N/A for J21
# ------------ BUILD STAGE -----------------------
FROM maven:3.9.11-${DISTRIBUTION}-${JAVA_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV JAVA_TOOL_OPTIONS=${JAVA_ARGS}
ARG PROFILE=default
ARG SPRING_BOOT_VERSION=4.0.0
ENV SPRING_BOOT_VERSION=${SPRING_BOOT_VERSION}
WORKDIR /app

COPY spring/jvm/tomcat/pom.xml ./tomcat/pom.xml
COPY spring/jvm/tomcat/src ./tomcat/src
COPY spring/jvm/netty/pom.xml ./netty/pom.xml
COPY spring/jvm/netty/src ./netty/src
COPY checkstyle.xml checkstyle.xml
COPY checkstyle-suppressions.xml checkstyle-suppressions.xml

# Conditionally select the correct POM and src files
RUN if [ "$PROFILE" = "netty" ]; then \
        echo "Preparing NETTY sources with PROFILE:$PROFILE and SPRING_BOOT_VERSION:$SPRING_BOOT_VERSION"; \
        cp ./netty/pom.xml pom.xml; \
        cp -r ./netty/src ./src; \
        rm -f ./tomcat/pom.xml; \
        rm -rf ./tomcat/src; \
    else \
        echo "Preparing TOMCAT sources with PROFILE:$PROFILE and SPRING_BOOT_VERSION:$SPRING_BOOT_VERSION"; \
        cp ./tomcat/pom.xml pom.xml; \
        cp -r ./tomcat/src ./src; \
        rm -f ./netty/pom.xml; \
        rm -rf ./netty/src; \
    fi

RUN mvn -v \
  && mvn -B -Dspring-boot.version=${SPRING_BOOT_VERSION} dependency:go-offline \
  && mvn -B -Dspring-boot.version=${SPRING_BOOT_VERSION} clean package \
    -Dmaven.compiler.release=${JAVA_RELEASE} \
    -Dcheckstyle.config.location=checkstyle.xml \
    -Dcheckstyle.suppressions.location=checkstyle.xml
#    -DskipTests

#-----------------------  RUNTIME STAGE -----------------------
FROM ${DISTRIBUTION}:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_RUNTIME} AS runtime
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}

# Create a dedicated non-root user/group (OpenShift-friendly UID/GID 1001)
RUN dnf install -y --setopt=install_weak_deps=False shadow-utils \
    && groupadd -g 1001 spring \
    && useradd -u 1001 -g spring -M -d /nonexistent -s /sbin/nologin spring \
    && dnf clean all && rm -rf /var/cache/dnf/*

WORKDIR /work

ARG OTEL_PYROSCOPE_VERSION=1.0.4
ADD https://github.com/grafana/otel-profiling-java/releases/download/v${OTEL_PYROSCOPE_VERSION}/pyroscope-otel.jar /work/pyroscope-otel-extension.jar
RUN chown 1001:1001 /work/pyroscope-otel-extension.jar; \
    chmod 0640 /work/pyroscope-otel-extension.jar

ARG OTEL_JAVA_AGENT_VERSION=2.23.0
ARG OTEL_JAVA_AGENT_FILENAME=opentelemetry-javaagent.jar
ARG OTEL_JAVA_AGENT_URL="https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_JAVA_AGENT_VERSION}/${OTEL_JAVA_AGENT_FILENAME}"
### Snapshots - prereleased:
#ARG OTEL_JAVA_AGENT_FILENAME=opentelemetry-javaagent-${OTEL_JAVA_AGENT_VERSION}-20251212.043721-77.jar
#ARG OTEL_JAVA_AGENT_URL="https://central.sonatype.com/repository/maven-snapshots/io/opentelemetry/javaagent/opentelemetry-javaagent/${OTEL_JAVA_AGENT_VERSION}-SNAPSHOT/${OTEL_JAVA_AGENT_FILENAME}"
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

WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
RUN chown 1001:1001 /app/app.jar && chmod 0644 /app/app.jar

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

# Run as non-root user (UID 1001 is OpenShift-friendly)
USER 1001

ENTRYPOINT ["java","-jar","app.jar"]