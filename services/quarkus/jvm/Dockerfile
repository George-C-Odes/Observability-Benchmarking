ARG DISTRIBUTION=amazoncorretto
#amazoncorretto, eclipse-temurin
ARG JAVA_RELEASE=25
#25, 23, 21
ARG JAVA_MINOR_RELEASE=.0.1
ARG BASE_BUILDER=debian
#noble, alpine, debian
ARG BASE_RUNTIME=al2023-headless
#jre-ubi10-minimal, alpine, al2023-headless
ARG JAVA_ARGS="--sun-misc-unsafe-memory-access=allow"
#Option N/A for J21 set to "", for J25 set "--sun-misc-unsafe-memory-access=allow" for suppressing warnings

FROM maven:3.9.11-${DISTRIBUTION}-${JAVA_RELEASE}-${BASE_BUILDER} AS builder
ARG JAVA_RELEASE
ENV JAVA_RELEASE=${JAVA_RELEASE}
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}
ENV JAVA_TOOL_OPTIONS=${JAVA_ARGS}
ENV HOME=/home/maven
ENV MAVEN_OPTS="-Duser.home=${HOME}"

RUN groupadd -r maven \
 && useradd -r -g maven -d /home/maven -s /bin/sh maven \
 && mkdir -p /home/maven \
 && chown -R maven:maven /home/maven

COPY --chown=maven:maven pom.xml /code/
USER maven
WORKDIR /code

ARG PROFILE=stage
ENV QUARKUS_PROFILE=${PROFILE}
ENV LANGUAGE='en_US:en'
ENV QUARKUS_NATIVE_ENABLED=false

RUN MAVEN_CONFIG= mvn -v \
    && MAVEN_CONFIG= mvn -B -Duser.home=${HOME} -Dmaven.repo.local=${HOME}/.m2 dependency:go-offline
COPY src /code/src
RUN MAVEN_CONFIG= mvn -B \
  -Duser.home=${HOME} \
  -Dmaven.repo.local=${HOME}/.m2 clean package \
  -Dquarkus.package.jar.type=fast-jar \
  -Dmaven.compiler.release=${JAVA_RELEASE}
#-DskipTests
#uber-jar

FROM ${DISTRIBUTION}:${JAVA_RELEASE}${JAVA_MINOR_RELEASE}-${BASE_RUNTIME} AS runtime
ARG JAVA_ARGS
ENV JAVA_ARGS=${JAVA_ARGS}

WORKDIR /work/

# Install curl & ca-certificates to support healthcheck and downloads
# Create a dedicated non-root user/group (OpenShift-friendly UID/GID 1001)
RUN mkdir -p /deployments /otel /work \
    && dnf install -y --setopt=install_weak_deps=False \
      shadow-utils \
    && update-ca-trust \
    && groupadd -g 1001 quarkus \
    && useradd -u 1001 -g quarkus -M -d /nonexistent -s /sbin/nologin quarkus \
    && dnf clean all && rm -rf /var/cache/dnf/*

WORKDIR /work

COPY --from=builder --chown=1001:1001 /code/target/quarkus-app/lib/ /deployments/lib/
COPY --from=builder --chown=1001:1001 /code/target/quarkus-app/*.jar /deployments/
COPY --from=builder --chown=1001:1001 /code/target/quarkus-app/app/ /deployments/app/
COPY --from=builder --chown=1001:1001 /code/target/quarkus-app/quarkus/ /deployments/quarkus/

ARG OTEL_PYROSCOPE_VERSION=1.0.4
ADD https://github.com/grafana/otel-profiling-java/releases/download/v${OTEL_PYROSCOPE_VERSION}/pyroscope-otel.jar /work/pyroscope-otel-extension.jar
RUN chown 1001:1001 /work/pyroscope-otel-extension.jar; \
    chmod 0640 /work/pyroscope-otel-extension.jar

ARG OTEL_JAVA_AGENT_VERSION=2.22.0
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_JAVA_AGENT_VERSION}/opentelemetry-javaagent.jar /work/opentelemetry-javaagent.jar
RUN chown 1001:1001 /work/opentelemetry-javaagent.jar && chmod 0640 /work/opentelemetry-javaagent.jar

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

RUN chown -R quarkus:quarkus /deployments /otel /work \
  && chmod -R g+rX,o-rwx /deployments /otel /work

# Run as non-root user (UID 1001 is OpenShift-friendly)
USER 1001

ARG PROFILE=stage
ENV QUARKUS_HTTP_HOST=0.0.0.0
ENV QUARKUS_PROFILE=${PROFILE}
ENTRYPOINT ["java", "-jar", "/deployments/quarkus-run.jar"]