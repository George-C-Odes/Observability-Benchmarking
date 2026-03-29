# Configs

This directory contains configuration files for observability components and services.

Place OpenTelemetry, Alloy, Loki, Tempo, Mimir, and Pyroscope configuration files here.

## Benchmark targets

`benchmark-targets.txt` defines the list of service endpoint URLs that the wrk2 load generator will benchmark. One full URL per line; blank lines and lines starting with `#` are ignored.

Managed via the Dashboard **Benchmark Targets** tab, or by editing the file directly.