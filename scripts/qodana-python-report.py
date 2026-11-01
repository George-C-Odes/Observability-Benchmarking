"""Summarize Qodana Community coverage and fail closed on missing inspections."""

import argparse
import json
from pathlib import Path

REQUIRED_INSPECTIONS = frozenset(
    {
        "PyArgumentListInspection",
        "PyAsyncCallInspection",
        "PyCompatibilityInspection",
        "PyDataclassInspection",
        "PyDefaultArgumentInspection",
        "PyMissingTypeHintsInspection",
        "PyTypeCheckerInspection",
        "PyUnresolvedReferencesInspection",
    }
)
# The reviewed 2026.2 profile had 106 enabled inspections; six are added here.
MIN_ENABLED_INSPECTIONS = 112


def inspection_summary(sarif: dict) -> dict:
    """Use SARIF rule configuration, not the number of findings, as coverage."""
    enabled = set()
    available = set()
    runs = sarif.get("runs", [])
    successful = bool(runs)
    problems = 0
    for run in runs:
        successful &= any(
            invocation.get("executionSuccessful", False)
            for invocation in run.get("invocations", [])
        )
        problems += len(run.get("results", []))
        tool = run.get("tool", {})
        for component in [tool.get("driver", {}), *tool.get("extensions", [])]:
            for rule in component.get("rules", []):
                rule_id = rule["id"]
                available.add(rule_id)
                if rule.get("defaultConfiguration", {}).get("enabled", True):
                    enabled.add(rule_id)
    return {
        "available": len(available),
        "enabled": len(enabled),
        "minimum_enabled": MIN_ENABLED_INSPECTIONS,
        "problems": problems,
        "execution_successful": successful,
        "missing_required": sorted(REQUIRED_INSPECTIONS - enabled),
        "enabled_inspections": sorted(enabled),
        "disabled_inspections": sorted(available - enabled),
    }


def markdown_summary(summary: dict) -> str:
    """Render only counts and controlled inspection identifiers as Markdown."""
    missing = summary["missing_required"]
    status = "PASS" if coverage_passes(summary) else "FAIL"
    lines = [
        "## Qodana Python Community inspection coverage",
        "",
        f"Coverage check: **{status}** (separate from the zero-issue quality gate).",
        "",
        "| Metric | Count |",
        "| --- | ---: |",
        f"| Available inspection definitions | {summary['available']} |",
        f"| Enabled inspections | {summary['enabled']} |",
        f"| Minimum enabled inspections | {summary['minimum_enabled']} |",
        f"| Reported problems | {summary['problems']} |",
        "",
    ]
    if missing:
        lines.extend(["Required inspections missing or disabled:", ""])
        lines.extend(f"- `{rule_id}`" for rule_id in missing)
    if not summary["execution_successful"]:
        lines.append("Analysis did not report a successful execution.")
    return "\n".join(lines) + "\n"


def coverage_passes(summary: dict) -> bool:
    return (
        summary["execution_successful"]
        and not summary["missing_required"]
        and summary["enabled"] >= summary["minimum_enabled"]
    )


def summarize_results(results_dir: Path) -> int:
    """Keep a diagnostic summary even when analysis failed before writing SARIF."""
    results_dir.mkdir(parents=True, exist_ok=True)
    sarif_path = results_dir / "qodana.sarif.json"
    try:
        sarif = json.loads(sarif_path.read_text(encoding="utf-8"))
        summary = inspection_summary(sarif)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        summary = inspection_summary({})
        summary["error"] = f"Cannot read Qodana SARIF: {error}"
    (results_dir / "inspection-summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    markdown = markdown_summary(summary)
    (results_dir / "inspection-summary.md").write_text(markdown, encoding="utf-8")
    print(markdown)
    return 0 if coverage_passes(summary) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("results_dir", type=Path)
    raise SystemExit(summarize_results(parser.parse_args().results_dir))
