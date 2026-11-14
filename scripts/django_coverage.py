"""Run local Django coverage and the same hard gates used by CI."""

import argparse
import os
import subprocess
import sys

from coverage_gate import CONFIG, ROOT, check, load_modules

RUNTIMES = {"django-platform": "WSGI", "django-reactive": "ASGI"}
COMMON = "services/python/django/gunicorn/common/src/obbench_django_common"


def run_runtime(name, modules, common_only=False):
    directory = ROOT / modules[name]["path"]
    report = directory / "coverage-summary.json"
    environment = dict(
        os.environ,
        OTEL_SDK_DISABLED="true",
        PYROSCOPE_ENABLED="false",
        COVERAGE_FILE=str(directory / ".coverage"),
    )
    report.unlink(missing_ok=True)
    commands = [
        [
            "run",
            "--branch",
            f"--source={directory},{ROOT / COMMON}",
            "--omit=*/tests/*",
            str(directory / "manage.py"),
            "test",
            "obbench_django_common.tests",
            "--verbosity=2",
        ],
        ["json", "-o", str(report), "--pretty-print"],
        ["xml", "-o", str(directory / "coverage.xml")],
        ["html", "-d", str(directory / "htmlcov")],
    ]
    failed = 0
    for arguments in commands:
        result = subprocess.run(
            [sys.executable, "-m", "coverage", *arguments],
            cwd=ROOT,
            env=environment,
            check=False,
            timeout=180,
        )
        failed |= result.returncode != 0
    for module in ["django-common"] if common_only else [name, "django-common"]:
        failed |= check(module, modules[module], ROOT, report)
    return int(failed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("module", choices=[*RUNTIMES, "django-common"])
    args = parser.parse_args()
    modules = load_modules(CONFIG)
    failed = 0
    for runtime in RUNTIMES if args.module == "django-common" else [args.module]:
        failed |= run_runtime(
            runtime, modules, common_only=args.module == "django-common"
        )
    return failed


if __name__ == "__main__":
    raise SystemExit(main())
