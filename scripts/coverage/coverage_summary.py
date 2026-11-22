"""Render CI coverage summaries; coverage_gate.py enforces module thresholds."""

import argparse
import json
import os
import subprocess
from pathlib import Path
from xml.parsers import expat

JACOCO_METRICS = (
    ("Instructions", "INSTRUCTION"),
    ("Branches", "BRANCH"),
    ("Lines", "LINE"),
    ("Methods", "METHOD"),
)
VITEST_METRICS = ("lines", "statements", "functions", "branches")
TABLE_HEADERS = {
    "python": ("Metric", "--------"),
    "standard": ("Metric    ", "------------"),
    "java": ("Metric      ", "--------------"),
}


def percentage(covered, total):
    return covered * 100 / total if total else 0.0


def table(rows, style="standard", bold=False):
    """Rows contain label, covered, missed, total, and a preformatted percentage."""
    label, separator = TABLE_HEADERS[style]
    result = f"| {label} | Covered | Missed | Total | Coverage |\n"
    result += f"|{separator}|--------:|-------:|------:|---------:|\n"
    for row in rows:
        cells = [f"**{value}**" if bold else str(value) for value in row]
        result += "| " + " | ".join(cells) + " |\n"
    return result


def append_summary(text):
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as output:
        output.write(text)


def read_json(path):
    with Path(path).open(encoding="utf-8") as source:
        return json.load(source)


def normalize_python_path(path, module_dir, workspace):
    path = path.replace("\\", "/")
    if workspace and os.path.isabs(path):
        try:
            return os.path.relpath(path, workspace).replace("\\", "/")
        except ValueError:
            return path
    if path.startswith("../"):
        return os.path.normpath(os.path.join(module_dir, path)).replace("\\", "/")
    if path.startswith("services/"):
        return path
    return f"{module_dir}/{path}".replace("//", "/")


def python_summary():
    name = os.environ["MODULE_NAME"]
    module = os.environ["MODULE_DIR"].replace("\\", "/")
    outcome = os.environ["TEST_OUTCOME"]
    report = os.environ["COVERAGE_JSON"]
    if not Path(report).is_file():
        if outcome == "success":
            append_summary(
                f"### ❌ Coverage: {name}\n\nTests passed but no coverage summary was generated.\n"
            )
            print(f"::error::Tests passed but {report} was not found")
            return 1
        append_summary(
            f"### ⚠️ Coverage: {name}\n\nNo coverage summary generated. Tests may have failed.\n"
        )
        return 0

    data = read_json(report)
    totals = data.get("totals", {})
    covered = int(totals.get("covered_lines", 0))
    missed = int(totals.get("missing_lines", 0))
    total = int(totals.get("num_statements", covered + missed))
    stmt_pct = percentage(covered, total)
    branch_c = int(totals.get("covered_branches", 0))
    branch_m = int(totals.get("missing_branches", 0))
    branch_t = int(totals.get("num_branches", branch_c + branch_m))
    branch_pct = f"{percentage(branch_c, branch_t):.1f}%" if branch_t else "n/a"
    badge = "✅ Tests passed" if outcome == "success" else "⚠️ Tests had issues"
    text = f"### 📊 Coverage: {name}\n\n**{badge}**\n\n"
    text += (
        table(
            [
                ("Statements", covered, missed, total, f"{stmt_pct:.1f}%"),
                ("Branches", branch_c, branch_m, branch_t, branch_pct),
            ],
            style="python",
            bold=True,
        )
        + "\n"
    )
    overall = float(totals.get("percent_covered", stmt_pct))
    partial = int(totals.get("num_partial_branches", 0))
    text += (
        f"> coverage.py overall coverage (statements + branches): **{overall:.1f}%**"
        f" · partial branches: **{partial}**\n\n"
    )
    files = data.get("files", {})
    if files:
        text += "<details>\n<summary>Per-file breakdown</summary>\n\n"
        text += (
            "| File | Statements | Covered | Branches | Covered branches | Coverage |\n"
        )
        text += (
            "|------|-----------:|--------:|---------:|-----------------:|---------:|\n"
        )
        for path in sorted(files):
            info = files[path].get("summary", {})
            path = normalize_python_path(
                path, module, os.environ.get("GITHUB_WORKSPACE", "")
            )
            text += (
                f"| `{path}` | {int(info.get('num_statements', 0))} | "
                f"{int(info.get('covered_lines', 0))} | "
                f"{int(info.get('num_branches', 0))} | {int(info.get('covered_branches', 0))} | "
                f"{float(info.get('percent_covered', 0.0)):.1f}% |\n"
            )
        text += "\n</details>\n\n"
    text += (
        f"> Reports generated from `{module}/coverage-summary.json`, `{module}/coverage.xml`, "
        f"and `{module}/htmlcov/`\n"
    )
    append_summary(text)
    return 0


def go_summary():
    name = os.environ["MODULE_NAME"]
    module = os.environ["MODULE_DIR"]
    outcome = os.environ["TEST_OUTCOME"]
    report = Path("coverage.out")
    if not report.is_file():
        if outcome == "success":
            append_summary(
                f"### ❌ Coverage: {name}\n\nTests passed but no coverage profile was generated.\n"
            )
            print("::error::Tests passed but coverage.out not found")
            return 1
        append_summary(
            f"### ⚠️ Coverage: {name}\n\nNo coverage profile generated. Tests may have failed.\n"
        )
        return 0
    files = {}
    for line in report.read_text(encoding="utf-8").splitlines():
        parts = line.strip().rsplit(" ", 2)
        if len(parts) != 3:
            continue
        location, statements, count = parts
        try:
            statements, count = int(statements), int(count)
        except ValueError:
            continue
        path = location.split(":")[0]
        total, covered = files.get(path, (0, 0))
        files[path] = (total + statements, covered + (statements if count > 0 else 0))
    total = sum(value[0] for value in files.values())
    covered = sum(value[1] for value in files.values())
    # CI setup-go owns PATH. The tool name and all arguments are fixed, not report data.
    # Optional detail remains best-effort, but never invoke a shell or wait forever.
    functions = subprocess.run(
        ["go", "tool", "cover", "-func=coverage.out"],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    ).stdout.strip()
    badge = "✅ Tests passed" if outcome == "success" else "⚠️ Tests had issues"
    text = f"### 📊 Coverage: {name}\n\n**{badge}**\n\n"
    text += (
        table(
            [
                (
                    "Statements",
                    covered,
                    total - covered,
                    total,
                    f"{percentage(covered, total):.1f}%",
                )
            ],
            bold=True,
        )
        + "\n"
    )
    if files:
        text += "<details>\n<summary>Per-file breakdown</summary>\n\n"
        text += (
            "| File | Statements | Covered | Coverage |\n"
            "|------|----------:|---------:|---------:|\n"
        )
        for path, (count, hit) in sorted(files.items()):
            text += f"| `{path}` | {count} | {hit} | {percentage(hit, count):.1f}% |\n"
        text += "\n</details>\n\n"
    if functions:
        text += "<details>\n<summary>Function-level detail (go tool cover -func)</summary>\n\n"
        text += f"```\n{functions}\n```\n\n</details>\n\n"
    append_summary(text + f"> Report generated from `{module}/coverage.out`\n")
    return 0


def jacoco_counters(path):
    # JaCoCo declares an external report.dtd. Do not fetch it or expand any entities.
    parser = expat.ParserCreate()
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    counters = {}
    depth = 0

    def reject_entity(*_args):
        raise ValueError("Entities are not permitted in JaCoCo reports")

    def start(name, attributes):
        nonlocal depth
        depth += 1
        if depth == 2 and name == "counter":
            if attributes.get("type") in counters:
                raise ValueError("Duplicate JaCoCo report counter")
            counters[attributes.get("type")] = (
                int(attributes["missed"]),
                int(attributes["covered"]),
            )

    def end(_name):
        nonlocal depth
        depth -= 1

    parser.EntityDeclHandler = reject_entity
    parser.ExternalEntityRefHandler = reject_entity
    parser.StartElementHandler = start
    parser.EndElementHandler = end
    with Path(path).open("rb") as source:
        parser.ParseFile(source)
    return counters


def jacoco_table(counters, bold=False):
    rows = []
    for label, kind in JACOCO_METRICS:
        missed, covered = counters.get(kind, (0, 0))
        rows.append(
            (
                label,
                covered,
                missed,
                missed + covered,
                f"{percentage(covered, missed + covered):.1f}%",
            )
        )
    return table(rows, style="java", bold=bold)


def java_summary():
    name, module, outcome = (
        os.environ[key] for key in ("MODULE_NAME", "MODULE_DIR", "BUILD_OUTCOME")
    )
    report = f"{module}/target/site/jacoco/jacoco.xml"
    if not Path(report).is_file():
        if outcome == "success":
            print(f"::error::Build succeeded but JaCoCo report not found at {report}")
            append_summary(
                f"### ❌ Coverage: {name}\n\nBuild succeeded but no JaCoCo report was "
                "generated. Check JaCoCo plugin configuration.\n"
            )
            return 1
        print(f"::warning::JaCoCo report not found at {report}")
        append_summary(
            f"### ⚠️ Coverage: {name}\n\nNo JaCoCo report was generated. Tests may "
            "have been skipped or failed before the report phase.\n"
        )
        return 0
    counters = jacoco_counters(report)
    badge = "✅ Build passed" if outcome == "success" else "❌ Build failed"
    append_summary(
        f"### 📊 Coverage: {name}\n\n**{badge}**\n\n"
        + jacoco_table(counters)
        + f"\n> Report generated from `{report}`\n"
    )
    return 0


def nextjs_summary():
    outcomes = [os.environ["NODE_OUTCOME"], os.environ["DOM_OUTCOME"]]
    text = "### 📊 Coverage: Next.js Dashboard\n\n"
    if outcomes == ["success", "success"]:
        text += "**✅ All tests passed**\n\n"
    else:
        failed = [
            label
            for label, outcome in zip(
                ("Node tests", "DOM tests"), outcomes, strict=True
            )
            if outcome != "success"
        ]
        text += f"**⚠️ Issues detected**: {', '.join(failed)} did not succeed\n\n"
    totals = []
    for environment, label in (
        ("node", "Node environment (lib, API routes)"),
        ("dom", "DOM environment (components, hooks)"),
    ):
        path = f"coverage/{environment}/coverage-summary.json"
        if not Path(path).is_file():
            text += f"**{label}**: ⚠️ No coverage report found at `{path}`\n\n"
            continue
        total = read_json(path).get("total", {})
        if total:
            totals.append(total)
        rows = []
        for metric in VITEST_METRICS:
            info = total.get(metric, {})
            covered, count = info.get("covered", 0), info.get("total", 0)
            rows.append(
                (
                    metric.capitalize(),
                    covered,
                    count - covered,
                    count,
                    f"{info.get('pct', 0)}%",
                )
            )
        text += f"#### {label}\n\n" + table(rows) + "\n"
    if totals:
        text += "#### 🔵 Combined weighted average (Codecov-comparable)\n\n"
        text += (
            "> This row mirrors Codecov's calculation: covered ÷ total "
            "summed across both environments.\n\n"
        )
        rows = []
        for metric in VITEST_METRICS:
            covered = sum(total.get(metric, {}).get("covered", 0) for total in totals)
            count = sum(total.get(metric, {}).get("total", 0) for total in totals)
            rows.append(
                (
                    metric.capitalize(),
                    covered,
                    count - covered,
                    count,
                    f"{round(percentage(covered, count), 2)}%",
                )
            )
        text += table(rows, bold=True) + "\n"
    append_summary(text + "> Reports generated by Vitest + @vitest/coverage-v8\n")
    return 0


def main():
    handlers = {
        "python": python_summary,
        "go": go_summary,
        "java": java_summary,
        "nextjs": nextjs_summary,
    }
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("format", choices=handlers)
    return handlers[parser.parse_args().format]()


if __name__ == "__main__":
    raise SystemExit(main())
