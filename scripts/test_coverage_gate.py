"""Exercise the hard gate's CLI, report boundaries, and per-module policy."""

import contextlib
import copy
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import coverage_gate as gate

SCRIPT = str(Path(gate.__file__).resolve())


class CoverageGateTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.modules = {
            kind: {
                "format": kind,
                "path": kind,
                "thresholds": dict.fromkeys(metrics, 90),
            }
            for kind, metrics in gate.METRICS.items()
        }
        self.enterContext(
            patch.dict(os.environ, GITHUB_STEP_SUMMARY=str(self.root / "summary"))
        )

    def write(self, filename, value):
        path = self.root / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")
        return path

    def java(self, lines=(10, 90), branches=(10, 90)):
        return self.write(
            "java/target/site/jacoco/jacoco.xml",
            '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">'
            '<report><package><counter type="LINE" missed="0" covered="999"/></package>'
            f'<counter type="LINE" missed="{lines[0]}" covered="{lines[1]}"/>'
            f'<counter type="BRANCH" missed="{branches[0]}" covered="{branches[1]}"/></report>',
        )

    def run_check(self, kind, report=None):
        with contextlib.redirect_stdout(io.StringIO()):
            return gate.check(kind, self.modules[kind], self.root, report)

    def vitest(self, environment, covered=90, total=100):
        counters = {
            metric: {"covered": covered, "total": total}
            for metric in ("lines", "branches")
        }
        return self.write(
            f"nextjs/coverage/{environment}/coverage-summary.json",
            json.dumps({"total": counters, f"{environment}.ts": counters}),
        )

    def python(self, lines=90, branches=90, path="python/source.py"):
        summary = {
            "covered_lines": lines,
            "missing_lines": 100 - lines,
            "num_statements": 100,
            "covered_branches": branches,
            "missing_branches": 100 - branches,
            "num_branches": 100,
        }
        return self.write(
            "python/coverage-summary.json",
            json.dumps(
                {
                    "meta": {"branch_coverage": True},
                    "files": {path: {"summary": summary}},
                }
            ),
        )

    def cli(self, *modules, config=None):
        if config is None:
            config = self.write(
                "config.json", json.dumps({"version": 1, "modules": self.modules})
            )
        command = [
            sys.executable,
            SCRIPT,
            "--root",
            str(self.root),
            "--config",
            str(config),
        ]
        command.extend(modules)
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=10,
            check=False,
        )

    def test_java_exact_boundary_and_independent_metrics(self):
        for lines, branches, expected in [
            ((10, 90), (10, 90), 0),
            ((11, 89), (0, 100), 1),
            ((0, 100), (11, 89), 1),
            ((0, 100), (0, 0), 0),
            ((0, 0), (0, 0), 1),
        ]:
            with self.subTest(lines=lines, branches=branches):
                self.java(lines, branches)
                self.assertEqual(self.run_check("java"), expected)

    def test_comparison_does_not_round_up(self):
        self.java(lines=(10001, 89999))
        self.assertEqual(self.run_check("java"), 1)

    def test_individual_thresholds(self):
        self.java(lines=(20, 80), branches=(30, 70))
        self.assertEqual(self.run_check("java"), 1)
        self.modules["java"]["thresholds"] = {"lines": 80, "branches": 70}
        self.assertEqual(self.run_check("java"), 0)

    def test_java_missing_malformed_negative_and_duplicate_counters(self):
        for content in (
            "<broken>",
            "<report/>",
            '<report><counter type="LINE" covered="-1" missed="101"/></report>',
            '<report><counter type="LINE" covered="100" missed="0"/>'
            '<counter type="LINE" covered="100" missed="0"/></report>',
            '<report><counter type="LINE" covered="100"/></report>',
        ):
            with self.subTest(content=content):
                self.write("java/target/site/jacoco/jacoco.xml", content)
                self.assertNotEqual(self.cli("java").returncode, 0)

    def test_java_external_entities_are_rejected(self):
        path = self.java()
        path.write_text(
            '<!DOCTYPE report [<!ENTITY secret SYSTEM "file:///synthetic">]>'
            "<report>&secret;</report>",
            encoding="utf-8",
        )
        result = self.cli("java")
        self.assertEqual(result.returncode, 1)
        self.assertIn("Entities are not permitted", result.stdout)

    def test_go_statement_weighting_and_boundary(self):
        for hits, expected in ((1, 0), (0, 1)):
            self.write(
                "go/coverage.out",
                f"mode: atomic\nhello/a.go:1.1,2.2 9 {hits}\nhello/b.go:3.1,4.2 1 0\n",
            )
            self.assertEqual(self.run_check("go"), expected)

    def test_go_invalid_or_empty_profiles_fail(self):
        for content in (
            "",
            "mode: atomic\n",
            "invalid\n",
            "mode: count\ninvalid\n",
            "mode: atomic\nx:1.1,2.2 -1 1\n",
            "mode: atomic\nx:1.1,2.2 1 1\nx:1.1,2.2 1 1\n",
        ):
            with self.subTest(content=content):
                self.write("go/coverage.out", content)
                self.assertEqual(self.cli("go").returncode, 1)

    def test_dashboard_requires_both_suites(self):
        self.vitest("node", 100)
        self.assertEqual(self.cli("nextjs").returncode, 1)
        self.vitest("dom", 80)
        self.assertEqual(self.run_check("nextjs"), 0)
        self.vitest("dom", 79)
        self.assertEqual(self.run_check("nextjs"), 1)

    def test_dashboard_weighted_counters_and_invalid_counts(self):
        self.vitest("node", 1, 1)
        self.vitest("dom", 0, 9)
        self.assertEqual(self.run_check("nextjs"), 1)
        for covered, total in ((101, 100), (-1, 100), (True, 100), (90.5, 100), (0, 0)):
            with self.subTest(covered=covered):
                self.vitest("dom", covered, total)
                self.assertEqual(self.cli("nextjs").returncode, 1)

    def test_dashboard_overlapping_or_missing_source_entries(self):
        node = self.vitest("node")
        dom = self.vitest("dom")
        dom.write_text(node.read_text(encoding="utf-8"), encoding="utf-8")
        self.assertEqual(self.cli("nextjs").returncode, 1)
        data = json.loads(node.read_text(encoding="utf-8"))
        del data["node.ts"]
        node.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.cli("nextjs").returncode, 1)

    def test_python_independent_lines_and_branches(self):
        for lines, branches, expected in ((90, 90, 0), (89, 100, 1), (100, 89, 1)):
            self.python(lines, branches)
            self.assertEqual(self.run_check("python"), expected)

    def test_python_shared_code_cannot_mask_runtime_coverage(self):
        report = self.python(89, 89)
        data = json.loads(report.read_text(encoding="utf-8"))
        data["files"]["common/source.py"] = {
            "summary": {
                "covered_lines": 10000,
                "missing_lines": 0,
                "num_statements": 10000,
                "covered_branches": 10000,
                "missing_branches": 0,
                "num_branches": 10000,
            }
        }
        report.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.run_check("python"), 1)
        self.modules["python"]["path"] = "common"
        self.assertEqual(self.run_check("python", report), 0)

    def test_python_branch_instrumentation_and_scope_required(self):
        report = self.python()
        data = json.loads(report.read_text(encoding="utf-8"))
        for branch_flag in (False, "true", None):
            data["meta"]["branch_coverage"] = branch_flag
            report.write_text(json.dumps(data), encoding="utf-8")
            self.assertEqual(self.cli("python").returncode, 1)
        self.python(path="different/source.py")
        self.assertEqual(self.cli("python").returncode, 1)

    def test_python_absolute_paths_and_zero_branches(self):
        report = self.python(path=str(self.root / "python/source.py"))
        data = json.loads(report.read_text(encoding="utf-8"))
        summary = next(iter(data["files"].values()))["summary"]
        summary.update(covered_branches=0, missing_branches=0, num_branches=0)
        report.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.run_check("python"), 0)
        summary["missing_lines"] = 0
        report.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.cli("python").returncode, 1)

    def test_missing_reports_and_unknown_modules_fail_cli(self):
        for name in (*self.modules, "unknown"):
            self.assertEqual(self.cli(name).returncode, 1)

    def test_all_requested_modules_checked_after_failure(self):
        result = self.cli("java", "python")
        self.assertEqual(result.returncode, 1)
        self.assertIn("gate java", result.stdout)
        self.assertIn("gate python", result.stdout)

    def test_invalid_threshold_configuration_fails_closed(self):
        for value in (True, -1, 101, "90", float("nan"), float("inf"), None):
            modules = copy.deepcopy(self.modules)
            modules["java"]["thresholds"]["lines"] = value
            config = self.write(
                "bad.json", json.dumps({"version": 1, "modules": modules})
            )
            self.assertEqual(self.cli("java", config=config).returncode, 1)
        config = self.write("bad.json", '{"version":1,"version":1,"modules":{}}')
        self.assertEqual(self.cli("java", config=config).returncode, 1)

    def test_go_cannot_claim_branch_coverage(self):
        self.modules["go"]["thresholds"]["branches"] = 90
        self.assertEqual(self.cli("go").returncode, 1)

    def test_repository_policy_has_90_percent_for_all_modules(self):
        modules = gate.load_modules(gate.CONFIG)
        self.assertEqual(len(modules), 18)
        for name, module in modules.items():
            self.assertTrue(module["thresholds"], name)
            self.assertEqual(set(module["thresholds"].values()), {90}, name)

    def test_cli_writes_gate_result_to_summary(self):
        self.java()
        self.assertEqual(self.cli("java").returncode, 0)
        self.assertIn(
            "| lines | 90.00% | 90% | PASS |", (self.root / "summary").read_text()
        )


if __name__ == "__main__":
    unittest.main()
