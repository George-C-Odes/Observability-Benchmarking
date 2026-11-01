"""Run Django-only Qodana Community on a disposable, unprivileged source copy."""

import argparse
import json
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import TextIO
from urllib.parse import urlsplit, urlunsplit

GIT_TIMEOUT_SECONDS = 30
SCAN_TIMEOUT_SECONDS = 20 * 60
COPY_TIMEOUT_SECONDS = 5 * 60
REMOVE_TIMEOUT_SECONDS = 60
PROCESS_EXIT_TIMEOUT_SECONDS = 10
TIMEOUT_STATUS = 124


def executable(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise RuntimeError(f"Required executable not found: {name}")
    return path


# Only fixed Git subcommands below call this helper; no shell or PR expressions.
def git_output(workspace: Path, *arguments: str) -> str:
    command = [executable("git"), "-C", str(workspace), *arguments]
    try:
        return subprocess.check_output(  # noqa: S603
            command, text=True, stderr=subprocess.DEVNULL, timeout=GIT_TIMEOUT_SECONDS
        ).strip()
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"Git command timed out after {GIT_TIMEOUT_SECONDS}s") from error


def sanitized_repository_uri(remote: str) -> str | None:
    """Retain a network repository URI, never credentials, queries or local paths."""
    if not remote or re.search(r"[\s\\\x00-\x1f\x7f]", remote):
        return None
    if "://" not in remote:
        scp = re.fullmatch(r"(?:[^/@:]+@)?([A-Za-z0-9.-]+):([^:]+)", remote)
        if scp is None or len(scp[1]) == 1:
            return None  # Includes Windows drive paths, not just file:// URLs.
        remote = f"ssh://{scp[1]}/{scp[2]}"
    try:
        uri = urlsplit(remote)
        if uri.scheme not in {"https", "http", "ssh", "git"} or not uri.hostname:
            return None
        host = uri.hostname
        if re.fullmatch(r"[A-Za-z0-9.:-]+", host) is None:
            return None
        authority = f"[{host}]" if ":" in host else host
        if uri.port is not None:
            authority += f":{uri.port}"
        return urlunsplit((uri.scheme, authority, uri.path, "", ""))
    except ValueError:
        return None


def git_provenance(workspace: Path) -> dict[str, str]:
    """Collect scalars on the host; never expose host Git files to the scanner."""
    revision = git_output(workspace, "rev-parse", "--verify", "HEAD")
    if re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", revision) is None:
        raise ValueError("Git returned an invalid revision ID.")
    provenance = {"revisionId": revision}
    try:
        branch = git_output(workspace, "symbolic-ref", "--quiet", "--short", "HEAD")
    except subprocess.CalledProcessError as error:
        if error.returncode != 1:
            raise
    else:
        if branch:
            provenance["branch"] = branch
    try:
        remote = git_output(workspace, "config", "--local", "--get", "remote.origin.url")
    except subprocess.CalledProcessError as error:
        if error.returncode != 1:
            raise
    else:
        repository_uri = sanitized_repository_uri(remote)
        if repository_uri:
            provenance["repositoryUri"] = repository_uri
    return provenance


def django_source(workspace: Path) -> Path:
    """The caller chooses a trusted workspace; its Django subtree cannot redirect."""
    source = workspace.resolve(strict=True)
    for component in ("services", "python", "django"):
        source = source / component
        if source.is_symlink() or source.is_junction() or source.resolve(strict=True) != source:
            raise ValueError("Symlinked source directories are not supported below the workspace.")
        if not source.is_dir():
            raise ValueError("Django source must be a directory within the workspace.")
    return source


def log_message(log: TextIO, message: str) -> None:
    print(message, flush=True)
    log.write(message + "\n")
    log.flush()


def add_sarif_provenance(results: Path, provenance: dict[str, str], log: TextIO) -> int:
    """Annotate exported SARIF only; scanner invocations and findings are untouched."""
    path = results / "qodana.sarif.json"
    try:
        if path.is_symlink() or path.resolve() != path:
            raise ValueError("Symlinked SARIF is not supported.")
        sarif = json.loads(path.read_text(encoding="utf-8"))
        runs = sarif["runs"]
        if not isinstance(runs, list) or not runs or any(not isinstance(run, dict) for run in runs):
            raise ValueError("SARIF must contain a nonempty list of runs.")
        for run in runs:
            if provenance.get("repositoryUri"):
                run["versionControlProvenance"] = [dict(provenance)]
            else:
                run.pop("versionControlProvenance", None)
                run.setdefault("properties", {})["gitProvenance"] = dict(provenance)
        path.write_text(json.dumps(sarif, ensure_ascii=False) + "\n", encoding="utf-8")
    except (OSError, ValueError, KeyError, TypeError) as error:
        # Do not echo report contents or unsanitized Git configuration into the log.
        log_message(log, f"Cannot add sanitized SARIF provenance ({type(error).__name__})")
        return 1
    return 0


def run_bounded_command(command: list[str], log: TextIO, timeout: int) -> int:
    """A stalled export must not prevent the separately bounded removal attempt."""
    try:
        return subprocess.call(  # noqa: S603
            command, stdout=log, stderr=subprocess.STDOUT, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        log_message(log, f"Docker {command[1]} timed out after {timeout}s")
        return TIMEOUT_STATUS
    except OSError as error:
        log_message(log, f"Cannot run Docker {command[1]}: {error}")
        return 1


def stream_scan(command: list[str], log: TextIO, timeout: float) -> int:
    """Bound the entire scan, including silent or continuously streaming stdout."""
    # Fixed Docker executable, validated image, argument vector, no shell.
    process = subprocess.Popen(  # noqa: S603
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    events: queue.Queue[str | Exception | None] = queue.Queue()

    def read_output() -> None:
        try:
            if process.stdout is None:
                raise RuntimeError("Docker output pipe was not created.")
            for line in process.stdout:
                events.put(line)
        except (OSError, ValueError, RuntimeError) as error:
            events.put(error)
        finally:
            events.put(None)

    reader = threading.Thread(target=read_output, daemon=True)
    deadline = time.monotonic() + timeout
    reader.start()
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(command, timeout)
            event = events.get(timeout=remaining)
            if event is None:
                return process.wait(timeout=max(0, deadline - time.monotonic()))
            if isinstance(event, Exception):
                raise event
            print(event, end="", flush=True)
            log.write(event)
            log.flush()
    except (queue.Empty, subprocess.TimeoutExpired):
        log_message(log, f"Qodana scan timed out after {timeout:g}s")
        return TIMEOUT_STATUS
    finally:
        # Do not use Popen's context manager: its unbounded wait can defeat the deadline.
        if process.poll() is None:
            process.kill()
            try:
                process.wait(timeout=PROCESS_EXIT_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                log_message(log, "Docker client did not exit after being killed")
        reader.join(timeout=1)
        if not reader.is_alive() and process.stdout is not None:
            process.stdout.close()


def docker_command(workspace: Path, staging: Path, image: str, name: str) -> list[str]:
    requirements = workspace / ".github/requirements"
    installer = workspace / ".github/actions/install-python-dependencies"
    uid = os.getuid() if hasattr(os, "getuid") else 1000
    gid = os.getgid() if hasattr(os, "getgid") else 1000
    if uid == 0:
        raise ValueError("Run this helper as a non-root user so staged files have safe ownership.")
    return [
        executable("docker"),
        "run",
        "--init",
        "--name",
        name,
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--user",
        f"{uid}:{gid}",
        "--workdir",
        "/data/workspace",
        "--env",
        "HOME=/tmp/qodana-home",
        "--env",
        "QODANA_CONF=/tmp/qodana-home/.config/idea",
        "--env",
        "PIP_USER=1",
        "--env",
        "QODANA_PYTHON_PATH=/opt/miniconda3/bin/python3",
        "--env",
        "QODANA_DJANGO_ROOT=/data/workspace/services/python/django",
        "--mount",
        f"type=bind,source={staging / 'workspace'},target=/data/workspace",
        "--mount",
        f"type=bind,source={requirements},target=/opt/python-ci/requirements,readonly",
        "--mount",
        f"type=bind,source={installer},target=/opt/python-ci/installer,readonly",
        image,
        "--project-dir=/data/workspace/services/python/django",
        "--config=/data/workspace/services/python/django/qodana.yaml",
        "--results-dir=/tmp/qodana-results",
        "--report-dir=/tmp/qodana-results/report",
        "--cache-dir=/tmp/qodana-cache",
        "--save-report",
    ]


def stage_project(workspace: Path, staging: Path) -> None:
    """Copy only source; never reuse host SDK metadata, caches or local secrets."""
    source = django_source(workspace)
    destination = staging / "workspace/services/python/django"
    ignore_patterns = shutil.ignore_patterns(
        ".git",
        ".idea",
        "*.iml",
        ".venv",
        "venv",
        "__pycache__",
        "*.pyc",
        "build",
        "*.egg-info",
        ".ruff_cache",
        ".pytest_cache",
        ".coverage*",
        "htmlcov",
        "coverage.xml",
        ".env",
        ".env.*",
    )

    def validate_source_entries(directory: str | Path, names: list[str]) -> set[str]:
        ignored = ignore_patterns(directory, names)
        for entry in names:
            if entry in ignored:
                continue
            path = Path(directory) / entry
            if path.is_symlink() or path.is_junction():
                raise ValueError(
                    "Symlinked source is not supported; staging must not read outside Django."
                )
        return ignored

    shutil.copytree(
        source,
        destination,
        symlinks=True,
        ignore=validate_source_entries,
    )
    if any(path.is_symlink() or path.is_junction() for path in destination.rglob("*")):
        raise ValueError("Symlinked source is not supported; staging must not read outside Django.")


def run_scan(workspace: Path, results: Path, image: str) -> int:
    workspace = workspace.resolve()
    results = results.resolve()
    # A digest is mandatory; keep the single image/version source in qodana.yaml.
    image_pattern = r"jetbrains/qodana-python-community:[\w.-]+@sha256:[a-f0-9]{64}"
    if re.fullmatch(image_pattern, image) is None:
        raise ValueError("A digest-pinned Qodana Python Community image is required.")
    results.mkdir(parents=True, exist_ok=True)
    # Reject stale evidence instead of mixing it into the new scan/artifact.
    if any(results.iterdir()):
        raise ValueError("The results directory must be empty for each scan.")
    provenance_status = 0
    with tempfile.TemporaryDirectory(prefix="qodana-python-") as temporary:
        staging = Path(temporary)
        stage_project(workspace, staging)
        provenance = git_provenance(workspace)
        name = f"qodana-python-{uuid.uuid4().hex}"
        command = docker_command(workspace, staging, image, name)
        with (results / "scan.log").open("w", encoding="utf-8") as log:
            try:
                scan_status = stream_scan(command, log, SCAN_TIMEOUT_SECONDS)
                # Export even after gate/bootstrap failure, before removing the container.
                copy_status = run_bounded_command(
                    [command[0], "cp", f"{name}:/tmp/qodana-results/.", str(results)],
                    log,
                    COPY_TIMEOUT_SECONDS,
                )
                if copy_status == 0:
                    provenance_status = add_sarif_provenance(results, provenance, log)
            finally:
                cleanup_status = run_bounded_command(
                    [command[0], "rm", "--force", name],
                    log,
                    REMOVE_TIMEOUT_SECONDS,
                )
            return scan_status or copy_status or cleanup_status or provenance_status


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--results-dir", required=True, type=Path)
    arguments = parser.parse_args()
    config = django_source(arguments.workspace) / "qodana.yaml"
    image_line = next(
        line
        for line in config.read_text(encoding="utf-8").splitlines()
        if line.startswith("linter:")
    )
    raise SystemExit(
        run_scan(arguments.workspace, arguments.results_dir, image_line.split(":", 1)[1].strip())
    )
