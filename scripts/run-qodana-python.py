"""Run Django-only Qodana Community on a disposable, unprivileged source copy."""

import argparse
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path


def executable(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise RuntimeError(f"Required executable not found: {name}")
    return path


# Only fixed Git subcommands below call this helper; no shell or PR expressions.
def git_output(workspace: Path, *arguments: str) -> str:
    command = [executable("git"), "-C", str(workspace), *arguments]
    return subprocess.check_output(command, text=True).strip()  # noqa: S603


def docker_command(workspace: Path, staging: Path, image: str, name: str) -> list[str]:
    git_dir = Path(git_output(workspace, "rev-parse", "--absolute-git-dir"))
    common_dir = Path(
        git_output(workspace, "rev-parse", "--path-format=absolute", "--git-common-dir")
    )
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
        "--env",
        "GIT_DIR=/opt/project-git",
        "--env",
        "GIT_COMMON_DIR=/opt/project-git-common",
        "--env",
        "GIT_WORK_TREE=/data/workspace",
        "--mount",
        f"type=bind,source={git_dir},target=/opt/project-git,readonly",
        "--mount",
        f"type=bind,source={common_dir},target=/opt/project-git-common,readonly",
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
    destination = staging / "workspace/services/python/django"
    shutil.copytree(
        workspace / "services/python/django",
        destination,
        symlinks=True,
        ignore=shutil.ignore_patterns(
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
        ),
    )
    if any(path.is_symlink() for path in destination.rglob("*")):
        raise ValueError("Symlinked source is not supported; staging must not read outside Django.")
    # The IDE's Git integration discovers marker files, not just GIT_* env vars.
    (staging / "workspace/.git").write_text("gitdir: /opt/project-git\n", encoding="utf-8")


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
    with tempfile.TemporaryDirectory(prefix="qodana-python-") as temporary:
        staging = Path(temporary)
        stage_project(workspace, staging)
        name = f"qodana-python-{uuid.uuid4().hex}"
        command = docker_command(workspace, staging, image, name)
        with (results / "scan.log").open("w", encoding="utf-8") as log:
            try:
                # Fixed Docker executable, validated image, argument vector, no shell.
                with subprocess.Popen(  # noqa: S603
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                ) as process:
                    if process.stdout is None:
                        raise RuntimeError("Docker output pipe was not created.")
                    for line in process.stdout:
                        print(line, end="", flush=True)
                        log.write(line)
                        log.flush()
                    scan_status = process.wait()
                # Export even after gate/bootstrap failure, before removing the container.
                copy_status = subprocess.call(  # noqa: S603
                    [command[0], "cp", f"{name}:/tmp/qodana-results/.", str(results)],
                    stdout=log,
                    stderr=subprocess.STDOUT,
                )
            finally:
                cleanup_status = subprocess.call(  # noqa: S603
                    [command[0], "rm", "--force", name],
                    stdout=log,
                    stderr=subprocess.STDOUT,
                )
            return scan_status or copy_status or cleanup_status


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--results-dir", required=True, type=Path)
    arguments = parser.parse_args()
    config = arguments.workspace / "services/python/django/qodana.yaml"
    image_line = next(
        line
        for line in config.read_text(encoding="utf-8").splitlines()
        if line.startswith("linter:")
    )
    raise SystemExit(
        run_scan(arguments.workspace, arguments.results_dir, image_line.split(":", 1)[1].strip())
    )
