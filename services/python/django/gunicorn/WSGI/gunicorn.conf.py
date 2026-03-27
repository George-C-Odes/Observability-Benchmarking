"""Gunicorn configuration — tuned for max throughput on 2 vCPUs.

https://docs.gunicorn.org/en/stable/settings.html

Key decisions
~~~~~~~~~~~~~
- ``gthread`` worker class: OS threads inside each worker process, giving the
  closest semantic to Java's ``platform`` thread model.
- 3 worker processes × 8 threads = 24 concurrent request handlers.
  3 workers slightly over-subscribes 2 vCPUs so the OS scheduler always has a
  ready worker when one blocks on socket I/O, without excessive context-switch
  overhead.  8 threads per worker overlaps I/O (GIL-released) with computation
  (GIL-held), similar to Jetty's thread-pool model.
- ``preload_app = True``: Django + cache are initialized once in the master
  process; forked workers share the read-only 50 000-entry cache via
  copy-on-write, saving ~100 ms warmup per worker and reducing RSS.
- ``post_fork`` hook re-initializes per-worker state (request counter,
  OTel SDK, OTel metrics, Pyroscope profiler) that must not be shared.
  The OTel SDK (TracerProvider, MeterProvider, LoggerProvider with export
  threads) is created **per-worker** here because daemon threads do NOT
  survive ``fork()``.
- ``worker_exit`` hook flushes pending OTel data before the worker dies.
"""

import os


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if raw:
        try:
            return int(raw)
        except ValueError:
            pass
    return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if raw in ("true", "1", "yes"):
        return True
    if raw in ("false", "0", "no"):
        return False
    return default


# ---------------------------------------------------------------------------
# Binding
# ---------------------------------------------------------------------------
bind = f"0.0.0.0:{os.environ.get('PORT', '8080')}"

# ---------------------------------------------------------------------------
# Worker class
# ---------------------------------------------------------------------------
# gthread = threaded workers (WSGI, platform threads)
worker_class = "gthread"

# ---------------------------------------------------------------------------
# Worker / thread counts
# ---------------------------------------------------------------------------
# 3 workers × 8 threads = 24 concurrent handlers.
# With GIL, true Python parallelism equals min(workers, vCPUs) = 2.
# The 3rd worker ensures a process is always runnable when one yields
# the CPU for socket send/recv (GIL is released during I/O).
workers = _env_int("DJANGO_PLATFORM_WORKERS", 3)
threads = _env_int("DJANGO_PLATFORM_THREADS", 8)

# ---------------------------------------------------------------------------
# Timeouts
# ---------------------------------------------------------------------------
# Under extreme load (120 K target, ~1-5 K actual) workers may appear stuck
# to the arbiter.  Disable the timeout to prevent needless worker restarts
# during benchmarks (0 = no timeout).
timeout = 0
graceful_timeout = 10
keepalive = 65  # slightly above typical LB idle (60 s)

# ---------------------------------------------------------------------------
# Throughput-relevant tuning
# ---------------------------------------------------------------------------
# Accept queue depth — matches PLATFORM_JETTY_ACCEPT_QUEUE_SIZE = 8192
# in Java Jetty-based services for fair comparison under load bursts.
backlog = _env_int("DJANGO_PLATFORM_BACKLOG", 8192)
reuse_port = _env_bool("DJANGO_PLATFORM_REUSE_PORT", True)

# CRITICAL: preload the app in the master process so that the 50 000-entry
# cache is populated once and shared across workers via COW.  This slashes
# warmup time and RSS.  Per-worker state (counter, OTel, Pyroscope) is
# re-initialized in the ``post_fork`` hook below.
preload_app = True

# Limit max requests per worker to prevent memory leaks (0 = unlimited).
max_requests = 0


# Use memory-backed tmpfs for worker heartbeat temp files.
# Inside Docker the default /tmp is overlayfs; /dev/shm is a real tmpfs.
# This avoids disk I/O on every heartbeat under heavy load.
worker_tmp_dir = "/dev/shm"

# Disable access log for benchmark purity (OTel captures HTTP metrics).
accesslog = None
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info").lower()

# ---------------------------------------------------------------------------
# Control socket (gunicorn ≥ 25)
# ---------------------------------------------------------------------------
# The nonroot user cannot create the socket at the default system path.
control_socket = "/tmp/gunicorn-ctrl.sock"

# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
forwarded_allow_ips = "*"
proxy_protocol = False


# ---------------------------------------------------------------------------
# Hooks
# ---------------------------------------------------------------------------


def post_fork(_server, _worker):
    """Per-worker initialization after fork (preload_app = True).

    The master process populates the cache and creates the ``HelloService``
    singleton.  Workers inherit this read-only state via COW.  This hook
    re-initializes *per-worker* state that must not be shared:
      - request counter  (reset to 0)
      - OTel SDK         (fresh providers with live export threads)
      - OTel metrics     (per-process observable counter)
      - Pyroscope        (per-process profiling agent)

    The OTel SDK is created here (not in the master) because background
    daemon threads (BatchSpanProcessor, PeriodicExportingMetricReader)
    do NOT survive ``fork()``.
    """
    from obbench_django_common.infrastructure.boot import post_fork_init

    post_fork_init()


def worker_exit(_server, _worker):
    """Flush pending OTel data on worker shutdown.

    Ensures all buffered traces, metrics, and logs are exported via OTLP
    before the worker process terminates.
    """
    from obbench_django_common.infrastructure.otel_setup import shutdown_sdk

    shutdown_sdk()
