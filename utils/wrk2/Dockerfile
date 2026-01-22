# syntax=docker/dockerfile:1.7

# --- Stage 1: Build wrk2 ------------------------------------------------------
FROM alpine:3.23.2 AS builder

# Toolchain + dependencies for building wrk2
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --no-cache \
    build-base \
    git \
    luajit \
    luajit-dev \
    openssl-dev \
    zlib-dev

# Build-time pin (keeps Dockerfile reproducible and cache-friendly)
ARG WRK2_REPO="https://github.com/George-C-Odes/wrk2.git"
ARG WRK2_REF="build-2026-01-14"
#ARG WRK2_REF="main"

# Cache git objects between builds for faster rebuilds
RUN --mount=type=cache,target=/root/.cache/git \
    git -c advice.detachedHead=false clone --branch "${WRK2_REF}" --depth 1 --single-branch "${WRK2_REPO}" /wrk2

WORKDIR /wrk2

# Build bytecode.o using system luajit, then compile/link against system LuaJIT.
# Cache the obj directory between builds.
RUN --mount=type=cache,target=/wrk2/obj \
    set -eux; \
    CFLAGS="-std=c99 -Wall -O2 -D_REENTRANT -D_POSIX_C_SOURCE=200809L -D_BSD_SOURCE"; \
    INCLUDES="-Ideps/luajit/src -Isrc"; \
    LIBS="-lluajit-5.1 -lpthread -lm -lcrypto -lssl -ldl -lz"; \
    mkdir -p obj; \
    luajit -b /wrk2/src/wrk.lua /wrk2/obj/bytecode.o; \
    compile() { cc $CFLAGS $INCLUDES -c -o "obj/$1.o" "src/$1.c"; }; \
    compile wrk; \
    compile net; \
    compile ssl; \
    compile aprintf; \
    compile stats; \
    compile script; \
    compile units; \
    compile ae; \
    compile zmalloc; \
    compile http_parser; \
    compile tinymt64; \
    compile hdr_histogram; \
    cc -o wrk obj/*.o $LIBS; \
    strip wrk

# --- Stage 2: Minimal runtime -------------------------------------------------
FROM alpine:3.23.2 as runtime

RUN --mount=type=cache,target=/var/cache/apk \
    apk add --no-cache \
    bash \
    ca-certificates \
    busybox-extras \
    luajit \
    libssl3 \
    libcrypto3 \
    tzdata \
    zlib

# Default timezone (can be overridden by env TZ at runtime)
ENV TZ="UTC"

# Ensure /etc/localtime and /etc/timezone match TZ (Alpine doesn't do this automatically)
RUN set -eux; \
    if [ -f "/usr/share/zoneinfo/${TZ}" ]; then \
      ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime; \
      echo "${TZ}" > /etc/timezone; \
    fi

# wrk2 readiness endpoint (/ready)
EXPOSE 3003

WORKDIR /wrk2

# Make `require("wrk")` work (the binary does `wrk = require "wrk"`).
ENV LUA_PATH="/wrk2/?.lua;/wrk2/scripts/?.lua;;"

COPY --from=builder /wrk2/wrk /wrk2/wrk
COPY --from=builder /wrk2/scripts /wrk2/scripts
COPY --from=builder /wrk2/src/wrk.lua /wrk2/wrk.lua

# Container scripts
COPY script /script

# Normalize Windows CRLF -> LF and ensure executability
RUN set -eux; \
    find /script -type f -name '*.sh' -print0 | xargs -0 sed -i 's/\r$//'; \
    chmod -R 0755 /script

# Script working directory (contains only the benchmark/ready scripts)
WORKDIR /script

# Create a dedicated writable output directory for benchmarks.
ENV WRK_BENCH_DIR=/benchmarks
# Default: auto-run benchmarks on container start (set WRK_AUTORUN=false to only keep readiness + exec)
ENV WRK_AUTORUN=true

# Run as non-root by default.
RUN addgroup -S wrk2 \
    && adduser -S -G wrk2 wrk2 \
    && chmod -R 0755 /script \
    && mkdir -p "$WRK_BENCH_DIR" \
    && chown -R wrk2:wrk2 "$WRK_BENCH_DIR" \
    && chmod 0775 "$WRK_BENCH_DIR" \
    && chown -R wrk2:wrk2 /etc/localtime /etc/timezone

# Default user (can be overridden in compose to match host UID/GID for bind mounts)
USER wrk2

ENTRYPOINT ["/script/entrypoint.sh"]