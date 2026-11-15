"""Regression tests for the shared CI coverage renderers."""

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import coverage_summary as coverage

SCRIPT = Path(coverage.__file__).resolve()


class CoverageSummaryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.enterContext(contextlib.chdir(self.root))
        self.env = {
            "GITHUB_STEP_SUMMARY": str(self.root / "summary.md"),
            "GITHUB_WORKSPACE": str(self.root),
            "MODULE_NAME": "example",
            "MODULE_DIR": "services/example",
            "TEST_OUTCOME": "success",
            "BUILD_OUTCOME": "success",
            "NODE_OUTCOME": "success",
            "DOM_OUTCOME": "success",
            "COVERAGE_JSON": str(self.root / "coverage.json"),
            "PYTHONPATH": str(SCRIPT.parent),
        }
        self.enterContext(patch.dict(os.environ, self.env))

    def write(self, path, text):
        path = self.root / path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def summary(self):
        return Path(self.env["GITHUB_STEP_SUMMARY"]).read_text(encoding="utf-8")

    def java_report(
        self,
        path="services/example/target/site/jacoco/jacoco.xml",
        lines=(85, 15),
        branches=(90, 10),
    ):
        lm, lc = lines
        bm, bc = branches
        return self.write(
            path,
            (
                '<report><package name="nested">'
                '<counter type="LINE" missed="0" covered="999"/></package>'
                f'<counter type="LINE" missed="{lm}" covered="{lc}"/>'
                f'<counter type="BRANCH" missed="{bm}" covered="{bc}"/></report>'
            ),
        )

    def vitest_report(self, environment, covered, total):
        return self.write(
            f"coverage/{environment}/coverage-summary.json",
            json.dumps(
                {
                    "total": {
                        metric: {
                            "covered": covered,
                            "total": total,
                            "pct": coverage.percentage(covered, total),
                        }
                        for metric in coverage.VITEST_METRICS
                    },
                }
            ),
        )

    def test_missing_reports_fail_only_after_success(self):
        for handler in (
            coverage.python_summary,
            coverage.go_summary,
            coverage.java_summary,
        ):
            for outcome, expected in (
                ("success", 1),
                ("failure", 0),
                ("skipped", 0),
                ("cancelled", 0),
            ):
                with self.subTest(format=handler.__name__, outcome=outcome):
                    with patch.dict(
                        os.environ, TEST_OUTCOME=outcome, BUILD_OUTCOME=outcome
                    ):
                        with contextlib.redirect_stdout(io.StringIO()):
                            self.assertEqual(handler(), expected)

    def test_python_statement_branch_totals_and_paths(self):
        info = {
            "covered_lines": 3,
            "missing_lines": 1,
            "num_statements": 4,
            "covered_branches": 1,
            "missing_branches": 1,
            "num_branches": 2,
            "num_partial_branches": 1,
            "percent_covered": 66.6667,
        }
        self.write(
            "coverage.json",
            json.dumps({"totals": info, "files": {"main.py": {"summary": info}}}),
        )
        self.assertEqual(coverage.python_summary(), 0)
        text = self.summary()
        self.assertIn("| **Statements** | **3** | **1** | **4** | **75.0%** |", text)
        self.assertIn("| **Branches** | **1** | **1** | **2** | **50.0%** |", text)
        self.assertIn("**66.7%** · partial branches: **1**", text)
        self.assertIn("`services/example/main.py`", text)

    def test_python_zero_branches_and_failed_tests_remain_distinct(self):
        self.write("coverage.json", "{}")
        with patch.dict(os.environ, TEST_OUTCOME="failure"):
            self.assertEqual(coverage.python_summary(), 0)
        self.assertIn("**n/a**", self.summary())
        self.assertIn("Tests had issues", self.summary())

    def test_python_path_normalization(self):
        normalize = coverage.normalize_python_path
        self.assertEqual(
            normalize("../common/a.py", "services/example", ""), "services/common/a.py"
        )
        self.assertEqual(
            normalize("services/common/a.py", "services/example", ""),
            "services/common/a.py",
        )
        self.assertEqual(
            normalize(str(self.root / "a.py"), "services/example", str(self.root)),
            "a.py",
        )
        self.assertEqual(
            normalize("dir\\a.py", "services/example", ""), "services/example/dir/a.py"
        )

    def test_go_statement_blocks_not_hit_counts(self):
        self.write(
            "coverage.out",
            "mode: atomic\nhello/a.go:1.1,1.9 3 12\nhello/a.go:2.1,2.9 1 0\n"
            "invalid\nhello/b.go:1.1,1.9 2 1\n",
        )
        with patch.object(
            coverage.subprocess,
            "run",
            return_value=SimpleNamespace(stdout="func detail\n"),
        ) as run:
            self.assertEqual(coverage.go_summary(), 0)
        run.assert_called_once_with(
            ["go", "tool", "cover", "-func=coverage.out"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        text = self.summary()
        self.assertIn("| **Statements** | **5** | **1** | **6** | **83.3%** |", text)
        self.assertIn("| `hello/a.go` | 4 | 3 | 75.0% |", text)
        self.assertIn("func detail", text)

    def test_go_empty_profile_and_unavailable_optional_detail(self):
        self.write("coverage.out", "mode: atomic\n")
        with patch.object(
            coverage.subprocess, "run", return_value=SimpleNamespace(stdout="")
        ):
            self.assertEqual(coverage.go_summary(), 0)
        self.assertIn("**0.0%**", self.summary())
        self.assertNotIn("Function-level detail", self.summary())

    def test_go_timeout_is_not_silently_successful(self):
        self.write("coverage.out", "mode: atomic\n")
        with patch.object(
            coverage.subprocess, "run", side_effect=subprocess.TimeoutExpired("go", 30)
        ):
            with self.assertRaises(subprocess.TimeoutExpired):
                coverage.go_summary()

    def test_java_summary_renders_root_counters_without_threshold_policy(self):
        self.java_report()
        self.assertEqual(coverage.java_summary(), 0)
        self.assertIn("15.0%", self.summary())
        self.assertNotIn("999", self.summary())
        self.assertNotIn("threshold", self.summary())
        self.assertFalse(Path("coverage-status").exists())

    def test_jacoco_standard_doctype_does_not_fetch_external_dtd(self):
        path = self.java_report()
        path.write_text(
            '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">'
            + path.read_text(),
            encoding="utf-8",
        )
        self.assertEqual(coverage.java_summary(), 0)
        self.assertFalse(Path("coverage-status").exists())

    def test_jacoco_rejects_entity_definitions(self):
        secret = self.write("secret.txt", "SYNTHETIC-SECRET-NOT-FOR-REPORTS")
        for entity in (
            '<!ENTITY data "expanded">',
            f'<!ENTITY data SYSTEM "{secret.as_uri()}">',
        ):
            with self.subTest(entity=entity):
                path = self.write(
                    "entities.xml",
                    f"<!DOCTYPE report [{entity}]><report>&data;</report>",
                )
                with self.assertRaisesRegex(ValueError, "Entities are not permitted"):
                    coverage.jacoco_counters(path)

    def test_nextjs_combined_is_weighted_and_preserves_environments(self):
        self.vitest_report("node", 1, 1)
        self.vitest_report("dom", 0, 9)
        self.assertEqual(coverage.nextjs_summary(), 0)
        text = self.summary()
        self.assertIn("| **Lines** | **1** | **9** | **10** | **10.0%** |", text)
        self.assertIn("Node environment (lib, API routes)", text)
        self.assertIn("DOM environment (components, hooks)", text)

    def test_nextjs_missing_report_remains_informational(self):
        with patch.dict(os.environ, DOM_OUTCOME="skipped"):
            self.assertEqual(coverage.nextjs_summary(), 0)
        self.assertIn("DOM tests did not succeed", self.summary())
        self.assertIn("No coverage report found", self.summary())
        self.assertNotIn("Combined weighted average", self.summary())

    def test_nextjs_one_report_and_zero_totals(self):
        self.vitest_report("node", 0, 0)
        self.assertEqual(coverage.nextjs_summary(), 0)
        self.assertIn("**0.0%**", self.summary())
        self.assertIn("No coverage report found", self.summary())

    def test_append_preserves_existing_summary(self):
        self.write("summary.md", "Existing summary\n")
        coverage.nextjs_summary()
        self.assertTrue(self.summary().startswith("Existing summary\n"))

    def test_cli_malformed_python_report_is_nonzero(self):
        self.write("coverage.json", "not JSON")
        result = subprocess.run(
            [sys.executable, "-m", "coverage_summary", "python"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Error", result.stderr)

    def test_cli_malformed_java_report_is_nonzero(self):
        self.write("services/example/target/site/jacoco/jacoco.xml", "<broken>")
        result = subprocess.run(
            [sys.executable, "-m", "coverage_summary", "java"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Error", result.stderr)

    def test_cli_malformed_nextjs_report_is_nonzero(self):
        self.write("coverage/node/coverage-summary.json", "[")
        result = subprocess.run(
            [sys.executable, "-m", "coverage_summary", "nextjs"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Error", result.stderr)

    def test_cli_missing_success_report_is_nonzero(self):
        result = subprocess.run(
            [sys.executable, "-m", "coverage_summary", "python"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=10,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("::error::", result.stdout)


if __name__ == "__main__":
    unittest.main()
