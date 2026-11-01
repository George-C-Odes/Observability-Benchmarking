"""Filesystem preparation for the Gunicorn runtime adapter."""

from __future__ import annotations

import os
import stat
from pathlib import Path


def prepare_runtime_directories(worker_tmp_dir: str, control_socket: str) -> None:
    """Prepare private directories before workers and the control server start.

    The heartbeat directory must be created after Docker mounts /dev/shm, not
    during the image build. Existing paths are checked without following the
    final symlink; unsafe paths fail startup instead of being silently repaired.
    Gunicorn unlinks heartbeat files itself, so these empty, container-local
    directories can also be reused after worker restarts and configuration reloads.
    """
    for directory in (Path(worker_tmp_dir), Path(control_socket).parent):
        if not directory.is_absolute():
            raise ValueError(f"Gunicorn runtime directory must be absolute: {directory}")
        directory.mkdir(mode=0o700, exist_ok=True)
        info = directory.lstat()
        if (
            not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.geteuid()
            or stat.S_IMODE(info.st_mode) != 0o700
        ):
            raise PermissionError(
                f"Gunicorn runtime directory must be an owned, non-symlink 0700 directory: "
                f"{directory}"
            )
