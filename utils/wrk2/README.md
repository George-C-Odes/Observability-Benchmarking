# wrk2 Load Generation

This folder builds the repo’s `wrk2` utility image and provides the scripts used by the `wrk2` service in `compose/utils.yml`.

## What this container does

- Always starts a **readiness endpoint** on `http://0.0.0.0:3003/ready` (served by `busybox httpd`).
- Optionally runs load tests automatically on startup.
- Stays running indefinitely so you can `exec` into it and run additional benchmarks.

## Readiness endpoint

The readiness server is implemented in `script/ready.sh` using `busybox httpd`.

- Port: `WRK_READY_PORT` (default `3003`)
- Path: `/ready`
- Response body: `OK`

With Docker Compose, the healthcheck probes:

- `http://127.0.0.1:3003/ready`

## Running benchmarks

Benchmarks are executed by `script/benchmark.sh`.

### Auto-run on container start

Controlled by:

- `WRK_AUTO_RUN=true|false` (default: `true`)

If `WRK_AUTO_RUN=false`, the container becomes an always-on worker with `/ready` and you run `benchmark.sh` manually via `docker exec`.

### On-demand (exec into container)

If the compose stack is already running:

```bash
docker compose --project-directory compose -f compose/utils.yml exec wrk2 sh -lc \
  "WRK_ITERATIONS=1 WRK_SAVE_LOGS=auto /script/benchmark.sh"
```

The script also supports help output:

```bash
docker compose --project-directory compose -f compose/utils.yml exec wrk2 /script/benchmark.sh --help
```

## Output locations & filenames

The benchmark script can write logs to:

1. **Inside the container** under `WRK_BENCH_DIR` (default `/benchmarks`).
   - In compose, `/benchmarks` is mounted as **tmpfs**, so data does **not** persist after container stop.

2. **Export to host** under `WRK_EXPORT_DIR` (default empty).
   - In compose, this is `/exports` and is bind-mounted to `${HOST_REPO}/results/benchmarks`.
   - Each completed benchmark log is immediately copied to:
     - `/exports/YYYYMMDD/<same_filename>`

### Filename format

Each benchmark log uses an iteration-aware name (same filename for both internal + exported copy):

- `HHMMSS__iterN__<host>_<endpoint>_<threads>_<connections>_<duration>_<rate>.log`

Example:

- `005426__iter3__quarkus-jvm_reactive_5_200_3m_120000.log`

The iteration counter is the loop counter in `benchmark.sh`.

## Permissions / Windows notes

Writing to Windows bind mounts (especially on Docker Desktop) can be permission-sensitive.

This setup avoids most issues by:

- using tmpfs at `/benchmarks` for the main write path (always writable)
- exporting completed logs to `/exports` (host bind mount)

If `/exports` is not writable, export is skipped with a warning and the benchmark still runs (logs remain inside `/benchmarks`).

The `wrk2` service defaults to running as root for portability:

- `user: "${WRK_UID:-0}:${WRK_GID:-0}"`

On Linux/WSL, if your host bind mount requires a specific owner, set `WRK_UID`/`WRK_GID` accordingly.

## Timezone handling

- The image includes `tzdata`.
- Compose sets `TZ` via `${TIMEZONE:-Europe/Nicosia}`.
- Scripts call `apply_tz` (see `script/lib.sh`), which updates `/etc/localtime` and `/etc/timezone` at runtime.

This affects benchmark filenames because timestamps use `date`.

## Common environment variables

The `wrk2` service in `compose/utils.yml` wires these (you can override via `.env` or your shell):

- Target selection:
  - `WRK_HOST` (e.g. `quarkus-jvm`, `spring-jvm-tomcat-platform`, `go`, or `combo`)
  - `WRK_PORT` (default `8080`)
  - `WRK_ENDPOINT` (`platform|virtual|reactive|combo`)

- Load shape:
  - `WRK_THREADS`
  - `WRK_CONNECTIONS`
  - `WRK_DURATION` (e.g. `30s`, `3m`)
  - `WRK_RATE` (required for wrk2 `-R`)

- Looping:
  - `WRK_SLEEP_INIT` (seconds)
  - `WRK_SLEEP_BETWEEN` (seconds)
  - `WRK_ITERATIONS` (0 = loop forever)

- Logging:
  - `WRK_SAVE_LOGS=true|false|auto`
  - `WRK_BENCH_DIR` (default `/benchmarks`)
  - `WRK_EXPORT_DIR` (default empty; set to `/exports` in compose)

- Readiness:
  - `WRK_READY_PORT` (default `3003`)

## Compose integration

The service definition lives in:

- `compose/utils.yml` (`services.wrk2`)

It exposes the readiness port and exports benchmark logs to the host under:

- `${HOST_REPO}/results/benchmarks`

## Quick sanity checks

These are lightweight checks you can run to confirm the container is up, the readiness endpoint responds, and `wrk` works.

### 1) From the host (HTTP probe)

```bash
curl -fsS http://localhost:3003/ready
```

Expected: output contains `OK`.

### 2) From inside the container (same as the integration test)

```bash
docker exec wrk2 /wrk2/wrk -t1 -c1 -d1s -R1 --timeout 3s http://0.0.0.0:3003/ready
```

Expected: wrk output includes a `Transfer/sec` line.

## Further sanity testing

For a broader end-to-end sanity suite (services + observability + wrk2 readiness/exec checks), see:

- `integration-tests/README.md`
