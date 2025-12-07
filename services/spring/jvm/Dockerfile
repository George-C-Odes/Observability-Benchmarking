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
WORKDIR /app

COPY tomcat/pom.xml ./tomcat/pom.xml
COPY tomcat/src ./tomcat/src
COPY netty/pom.xml ./netty/pom.xml
COPY netty/src ./netty/src

# Conditionally select the correct POM and src files
RUN if [ "$PROFILE" = "tomcat" ]; then \
        echo "Preparing TOMCAT sources for $PROFILE" ; \
        cp ./tomcat/pom.xml pom.xml ; \
        cp -r ./tomcat/src ./src; \
        rm -f ./netty/pom.xml ; \
        rm -rf ./netty/src ; \
    else \
        echo "Preparing NETTY sources for $PROFILE" ; \
        cp ./netty/pom.xml pom.xml ; \
        cp -r ./netty/src ./src; \
        rm -f ./tomcat/pom.xml ; \
        rm -rf ./tomcat/src ; \
    fi

RUN mvn -v \
    && mvn dependency:go-offline -B \
    && mvn clean package -DskipTests -Dmaven.compiler.release=${JAVA_RELEASE}

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

ARG OTEL_JAVA_AGENT_VERSION=2.22.0
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_JAVA_AGENT_VERSION}/opentelemetry-javaagent.jar /work/opentelemetry-javaagent.jar
RUN chown 1001:1001 /work/opentelemetry-javaagent.jar && chmod 0640 /work/opentelemetry-javaagent.jar

WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
RUN chown 1001:1001 /app/app.jar && chmod 0640 /app/app.jar

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