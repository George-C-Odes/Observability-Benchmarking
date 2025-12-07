# --- Stage 1: Build wrk ------------------------------------------------------
FROM alpine:3.20.8 AS builder
#Newer alpine version opens a can of worms to get to work
RUN apk add --no-cache build-base cmake git luajit-dev make musl-dev openssl-dev zlib-dev \
  && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/George-C-Odes/wrk2.git /wrk2

WORKDIR /wrk2

# Ensure scripts in LuaJIT (and other build helpers) are executable and use LF line endings
RUN find deps/luajit/src -type f -exec dos2unix {} + || true \
  && find deps/luajit/src -type f -exec chmod +x {} + || true \
  && make

# --- Stage 2: Minimal runtime -------------------------------------------------
FROM alpine:3.22.2
ENV TZ=UTC

RUN apk add --no-cache bash luajit tzdata \
    && cp /usr/share/zoneinfo/"$TZ" /etc/localtime \
    && echo "$TZ" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /wrk2/wrk /wrk2/wrk
COPY --from=builder /wrk2/scripts /wrk2/scripts
COPY run.sh /usr/local/bin/run.sh
RUN chmod +x /usr/local/bin/run.sh && mkdir -p /usr/local/bin/benchmarks

WORKDIR /usr/local/bin
CMD ["tail", "-f", "/dev/null"]