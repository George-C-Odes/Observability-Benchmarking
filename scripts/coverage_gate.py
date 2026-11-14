"""Fail a module's CI job on missing evidence or unmet coverage thresholds."""

import argparse
import json
import os
import re
from decimal import Decimal
from pathlib import Path
from xml.parsers.expat import ExpatError

from coverage_summary import jacoco_counters

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "scripts/coverage-thresholds.json"
METRICS = {
    "java": {"lines", "branches"},
    "python": {"lines", "branches"},
    "nextjs": {"lines", "branches"},
    "go": {"statements"},
}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path):
    """Read a report/config selected by a trusted local or CI launcher.

    CLI paths are filesystem selectors, not a sandbox for remote/LLM input.
    """
    return json.loads(
        Path(path).read_text(encoding="utf-8"), object_pairs_hook=unique_object
    )


def count(value):
    if type(value) is not int or value < 0:
        raise ValueError(f"Invalid coverage count: {value!r}")
    return value


def pair(covered, total):
    covered, total = count(covered), count(total)
    if covered > total:
        raise ValueError("Covered count exceeds total")
    return covered, total


def json_metrics(data, python=False):
    result = {}
    for metric in ("lines", "branches"):
        if python:
            covered = data[f"covered_{metric}"]
            total = data["num_statements" if metric == "lines" else "num_branches"]
            if count(data[f"missing_{metric}"]) + count(covered) != count(total):
                raise ValueError(f"Inconsistent {metric} counters")
        else:
            covered, total = data[metric]["covered"], data[metric]["total"]
        result[metric] = pair(covered, total)
    return result


def add_metrics(results):
    total = {"lines": (0, 0), "branches": (0, 0)}
    for result in results:
        for metric, (covered, size) in result.items():
            prev_c, prev_t = total[metric]
            total[metric] = (prev_c + covered, prev_t + size)
    return total


def java_measurements(directory):
    counters = jacoco_counters(directory / "target/site/jacoco/jacoco.xml")
    result = {}
    for metric, counter in (("lines", "LINE"), ("branches", "BRANCH")):
        missed, covered = counters[counter]
        result[metric] = pair(covered, count(missed) + count(covered))
    return result


def nextjs_measurements(directory):
    # Both suites are mandatory. Their source scopes must be disjoint.
    results, files = [], set()
    for environment in ("node", "dom"):
        data = read_json(directory / f"coverage/{environment}/coverage-summary.json")
        names = set(data) - {"total"}
        if not names or files.intersection(names):
            raise ValueError("Missing or overlapping dashboard source coverage")
        files.update(names)
        metrics = json_metrics(data["total"])
        if metrics["lines"][1] == 0:
            raise ValueError(f"Empty dashboard {environment} coverage")
        if add_metrics(json_metrics(data[name]) for name in names) != metrics:
            raise ValueError(f"Inconsistent dashboard {environment} coverage totals")
        results.append(metrics)
    return add_metrics(results)


def python_measurements(module, root, directory, report):
    data = read_json(report or directory / "coverage-summary.json")
    if data["meta"]["branch_coverage"] is not True:
        raise ValueError("Python report must contain branch coverage")
    results = []
    for filename, info in data["files"].items():
        source = Path(filename)
        if not source.is_absolute():
            source = root / source
        if source.resolve().is_relative_to(directory.resolve()):
            results.append(json_metrics(info["summary"], python=True))
    if not results:
        raise ValueError(f"No Python coverage for {module['path']}")
    return add_metrics(results)


def go_measurements(directory):
    # Go records statement-weighted blocks; it does not measure branches/lines.
    rows = (directory / "coverage.out").read_text(encoding="utf-8").splitlines()
    if not rows or rows[0] not in {"mode: atomic", "mode: count", "mode: set"}:
        raise ValueError("Invalid Go coverage header")
    covered = total = 0
    seen = set()
    for row in rows[1:]:
        match = re.fullmatch(r"(.+:\d+\.\d+,\d+\.\d+) (\d+) (\d+)", row)
        if not match or match[1] in seen:
            raise ValueError("Invalid or duplicate Go coverage block")
        seen.add(match[1])
        statements, hits = int(match[2]), int(match[3])
        total += statements
        covered += statements if hits else 0
    return {"statements": pair(covered, total)}


def measurements(module, root, report=None):
    kind, directory = module["format"], root / module["path"]
    if report is not None and kind != "python":
        raise ValueError("--report is only supported for Python runtime reports")
    if kind == "python":
        return python_measurements(module, root, directory, report)
    readers = {
        "java": java_measurements,
        "nextjs": nextjs_measurements,
        "go": go_measurements,
    }
    return readers[kind](directory)


def validate_threshold(name, threshold):
    if type(threshold) not in (int, float) or not Decimal(str(threshold)).is_finite():
        raise ValueError(f"Invalid threshold for {name}")
    if not 0 <= threshold <= 100:
        raise ValueError(f"Threshold outside 0..100 for {name}")


def validate_module(name, module):
    if not re.fullmatch(r"[a-z0-9-]+", name):
        raise ValueError("Invalid module name")
    kind = module["format"]
    if kind not in METRICS or set(module["thresholds"]) != METRICS[kind]:
        raise ValueError(f"Invalid coverage metrics for {name}")
    path = Path(module["path"])
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"Invalid module path for {name}")
    for threshold in module["thresholds"].values():
        validate_threshold(name, threshold)


def load_modules(path):
    config = read_json(path)
    if (
        type(config["version"]) is not int
        or config["version"] != 1
        or not config["modules"]
    ):
        raise ValueError("Invalid coverage configuration")
    modules = config["modules"]
    for name, module in modules.items():
        validate_module(name, module)
    return modules


def check(name, module, root, report=None):
    values = measurements(module, root, report)
    failed = False
    lines = [
        f"### Coverage gate: {name}\n",
        "| Metric | Coverage | Minimum | Result |",
        "|---|---:|---:|---|",
    ]
    for metric, minimum in module["thresholds"].items():
        covered, total = values[metric]
        # Zero branches is valid for straight-line code. Empty executable code is not.
        passed = (
            (metric == "branches")
            if total == 0
            else (Decimal(covered) * 100 >= Decimal(str(minimum)) * total)
        )
        percentage = f"{covered * 100 / total:.2f}%" if total else "n/a (0 total)"
        result = "PASS" if passed else "FAIL"
        message = f"{name}: {metric} {covered}/{total} ({percentage}), minimum {minimum}%: {result}"
        print(message if passed else f"::error::{message}")
        lines.append(f"| {metric} | {percentage} | {minimum}% | {result} |")
        failed |= not passed
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(summary).open("a", encoding="utf-8") as output:
            output.write("\n" + "\n".join(lines) + "\n")
    return int(failed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("modules", nargs="+")
    parser.add_argument("--config", type=Path, default=CONFIG)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        modules = load_modules(args.config)
        failed = 0
        for name in args.modules:
            try:
                failed |= check(name, modules[name], args.root, args.report)
            except (OSError, ValueError, KeyError, TypeError, ExpatError) as error:
                print(f"::error::Coverage gate {name}: {error}")
                failed = 1
        return failed
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"::error::Coverage configuration: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
