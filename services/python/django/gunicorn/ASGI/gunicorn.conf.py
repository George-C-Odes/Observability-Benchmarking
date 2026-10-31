"""Gunicorn configuration for the ASGI reactive Django module.

Runs Django's ASGI application with Uvicorn workers while still keeping
``preload_app = True`` so the shared 50 000-entry cache is populated once in the
master process and inherited by workers via copy-on-write.
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
worker_class = "uvicorn.workers.UvicornWorker"

# ---------------------------------------------------------------------------
# Throughput-relevant tuning
# ---------------------------------------------------------------------------
# With a 2 vCPU limit and a tiny CPU-bound hot path, 2 workers is the sensible
# baseline. ASGI gives us efficient socket handling and coroutine scheduling,
# while avoiding the extra thread-management overhead of the WSGI platform mode.
workers = _env_int("DJANGO_REACTIVE_WORKERS", 2)
backlog = _env_int("DJANGO_REACTIVE_BACKLOG", 8192)
reuse_port = _env_bool("DJANGO_REACTIVE_REUSE_PORT", True)

# ---------------------------------------------------------------------------
# Timeouts
# ---------------------------------------------------------------------------
timeout = 0
graceful_timeout = 10
keepalive = 65

# ---------------------------------------------------------------------------
# Performance / memory model
# ---------------------------------------------------------------------------
preload_app = True
max_requests = 0
# Keep heartbeat files on tmpfs, inside a private directory created at startup.
worker_tmp_dir = os.environ.get("GUNICORN_WORKER_TMP_DIR", "/dev/shm/obbench-gunicorn")

# Disable access log for benchmark purity (OTel captures HTTP metrics).
accesslog = None
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info").lower()

# ---------------------------------------------------------------------------
# Control socket (gunicorn ≥ 25)
# ---------------------------------------------------------------------------
# The image provisions this private 0700 directory for the nonroot runtime user.
control_socket = os.environ.get("GUNICORN_CONTROL_SOCKET", "/app/gunicorn-control/gunicorn.sock")

# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
forwarded_allow_ips = "*"
proxy_protocol = False


# ---------------------------------------------------------------------------
# Hooks
# ---------------------------------------------------------------------------


def on_starting(server):
    """Prepare private runtime directories before workers are constructed."""
    from obbench_django_common.infrastructure.gunicorn_runtime import prepare_runtime_directories

    prepare_runtime_directories(server.cfg.worker_tmp_dir, server.cfg.control_socket)


def post_fork(_server, _worker):
    """Per-worker initialization after fork (preload_app = True)."""
    from obbench_django_common.infrastructure.boot import post_fork_init

    post_fork_init()


def worker_exit(_server, _worker):
    """Flush pending OTel data on worker shutdown."""
    from obbench_django_common.infrastructure.otel_setup import shutdown_sdk

    shutdown_sdk()
