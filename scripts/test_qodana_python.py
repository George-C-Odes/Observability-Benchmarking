"""Tests for Django Qodana isolation, hardening, and inspection coverage."""

import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import time
import unittest
import xml.etree.ElementTree as ElementTree
from pathlib import Path
from unittest.mock import MagicMock, patch


def load_module(filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(path.stem.replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = load_module("run-qodana-python.py")
report = load_module("qodana-python-report.py")
IMAGE = "jetbrains/qodana-python-community:2026.2@sha256:" + "a" * 64


def sarif_fixture(enabled=True, successful=True):
    ids = sorted(report.REQUIRED_INSPECTIONS)
    ids.extend(f"FixtureInspection{i}" for i in range(report.MIN_ENABLED_INSPECTIONS - len(ids)))
    rules = [{"id": rule_id, "defaultConfiguration": {"enabled": enabled}} for rule_id in ids]
    return {
        "runs": [
            {
                "tool": {"driver": {"rules": []}, "extensions": [{"rules": rules}]},
                "invocations": [{"executionSuccessful": successful}],
                "results": [],
            }
        ]
    }


class InspectionSummaryTests(unittest.TestCase):
    def test_zero_findings_does_not_mean_zero_inspections(self):
        summary = report.inspection_summary(sarif_fixture())
        self.assertEqual(112, summary["enabled"])
        self.assertEqual(0, summary["problems"])
        self.assertTrue(report.coverage_passes(summary))

    def test_disabled_required_inspections_fail(self):
        summary = report.inspection_summary(sarif_fixture(enabled=False))
        self.assertFalse(report.coverage_passes(summary))
        self.assertEqual(sorted(report.REQUIRED_INSPECTIONS), summary["missing_required"])

    def test_count_regression_fails_with_required_inspections_still_enabled(self):
        fixture = sarif_fixture()
        fixture["runs"][0]["tool"]["extensions"][0]["rules"].pop()
        summary = report.inspection_summary(fixture)
        self.assertFalse(summary["missing_required"])
        self.assertFalse(report.coverage_passes(summary))

    def test_unsuccessful_execution_fails(self):
        summary = report.inspection_summary(sarif_fixture(successful=False))
        self.assertFalse(report.coverage_passes(summary))

    def test_one_successful_run_cannot_mask_a_failed_run(self):
        fixture = sarif_fixture()
        fixture["runs"].extend(sarif_fixture(successful=False)["runs"])
        self.assertFalse(report.coverage_passes(report.inspection_summary(fixture)))

    def test_every_invocation_must_explicitly_succeed(self):
        for unsuccessful in ({}, {"executionSuccessful": False}, {"executionSuccessful": None}):
            for failed_first in (False, True):
                with self.subTest(unsuccessful=unsuccessful, failed_first=failed_first):
                    fixture = sarif_fixture()
                    invocations = [{"executionSuccessful": True}, unsuccessful]
                    fixture["runs"][0]["invocations"] = (
                        list(reversed(invocations)) if failed_first else invocations
                    )
                    summary = report.inspection_summary(fixture)
                    self.assertFalse(summary["execution_successful"])
                    self.assertFalse(report.coverage_passes(summary))

    def test_truthy_non_boolean_success_flags_fail(self):
        for value in (1, "true", "false", [True], {"success": True}):
            with self.subTest(value=value):
                fixture = sarif_fixture(successful=value)
                fixture["runs"][0]["invocations"].append({"executionSuccessful": True})
                self.assertFalse(report.coverage_passes(report.inspection_summary(fixture)))

    def test_every_run_requires_nonempty_invocations(self):
        for missing_key in (False, True):
            with self.subTest(missing_key=missing_key):
                fixture = sarif_fixture()
                other_run = sarif_fixture()["runs"][0]
                if missing_key:
                    other_run.pop("invocations")
                else:
                    other_run["invocations"] = []
                fixture["runs"].append(other_run)
                self.assertFalse(report.coverage_passes(report.inspection_summary(fixture)))

    def test_multiple_successful_invocations_and_runs_pass(self):
        fixture = sarif_fixture()
        fixture["runs"].extend(sarif_fixture()["runs"])
        for run in fixture["runs"]:
            run["invocations"].append({"executionSuccessful": True})
        self.assertTrue(report.coverage_passes(report.inspection_summary(fixture)))

    def test_duplicate_rule_ids_do_not_inflate_coverage(self):
        fixture = sarif_fixture()
        rules = fixture["runs"][0]["tool"]["extensions"][0]["rules"]
        fixture["runs"][0]["tool"]["driver"]["rules"] = rules
        self.assertEqual(112, report.inspection_summary(fixture)["enabled"])

    def test_missing_and_malformed_sarif_still_produce_diagnostics(self):
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.dict(report.os.environ, {"RUNNER_TEMP": temporary}),
        ):
            results = Path(temporary) / "qodana-python/results"
            results.mkdir(parents=True)
            for contents in (None, "not json", "null", "[]"):
                with self.subTest(contents=contents):
                    if contents is not None:
                        (results / "qodana.sarif.json").write_text(contents, encoding="utf-8")
                    self.assertEqual(1, report.summarize_results(results))
                    summary = json.loads((results / "inspection-summary.json").read_text("utf-8"))
                    self.assertIn("error", summary)
                    self.assertIn("FAIL", (results / "inspection-summary.md").read_text("utf-8"))


class ReportPathTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        environment = patch.dict(report.os.environ, {"RUNNER_TEMP": str(self.root)})
        environment.start()
        self.addCleanup(environment.stop)
        self.results = self.root / "qodana-python/results"

    def create_symlink(self, link: Path, target: Path, *, directory=False):
        try:
            link.symlink_to(target, target_is_directory=directory)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"Symlinks are unavailable: {error}")

    def test_valid_results_produce_passing_summary(self):
        self.results.mkdir(parents=True)
        (self.results / "qodana.sarif.json").write_text(
            json.dumps(sarif_fixture()), encoding="utf-8"
        )
        self.assertEqual(0, report.summarize_results(self.results))
        summary = json.loads((self.results / "inspection-summary.json").read_text("utf-8"))
        self.assertTrue(report.coverage_passes(summary))
        self.assertIn("PASS", (self.results / "inspection-summary.md").read_text("utf-8"))

    def test_missing_results_directory_still_produces_diagnostics(self):
        self.assertEqual(1, report.summarize_results(self.results))
        self.assertTrue((self.results / "inspection-summary.json").is_file())
        self.assertIn("FAIL", (self.results / "inspection-summary.md").read_text("utf-8"))

    def test_cli_rejects_mixed_invocations_and_retains_diagnostics(self):
        self.results.mkdir(parents=True)
        for failure in ({"executionSuccessful": False}, {}):
            with self.subTest(failure=failure):
                fixture = sarif_fixture()
                fixture["runs"][0]["invocations"].append(failure)
                (self.results / "qodana.sarif.json").write_text(
                    json.dumps(fixture), encoding="utf-8"
                )
                # Fixed current Python and repository-owned script; no shell/user command.
                completed = subprocess.run(  # noqa: S603
                    [
                        sys.executable,
                        str(Path(__file__).with_name("qodana-python-report.py")),
                        str(self.results),
                    ],
                    env=dict(report.os.environ),
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=10,
                    check=False,
                )
                self.assertEqual(1, completed.returncode, completed.stderr)
                self.assertIn("FAIL", completed.stdout)
                summary = json.loads((self.results / "inspection-summary.json").read_text("utf-8"))
                self.assertFalse(summary["execution_successful"])
                self.assertEqual(report.MIN_ENABLED_INSPECTIONS, summary["enabled"])
                self.assertFalse(summary["missing_required"])
                markdown = (self.results / "inspection-summary.md").read_text("utf-8")
                self.assertIn("FAIL", markdown)
                self.assertIn("Analysis did not report a successful execution.", markdown)

    def test_arbitrary_paths_are_rejected_before_filesystem_changes(self):
        for path in (
            self.root / "outside",
            self.results / "../../outside",
            self.root / "qodana-python/results-other",
            self.results / "child",
            self.root,
        ):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "Results directory"):
                report.summarize_results(path)
            self.assertEqual([], list(self.root.iterdir()))

    def test_os_temporary_directory_is_used_locally(self):
        with (
            patch.dict(report.os.environ, {}, clear=True),
            patch.object(report.tempfile, "gettempdir", return_value=str(self.root)),
        ):
            self.assertEqual(1, report.summarize_results(self.results))
        self.assertTrue((self.results / "inspection-summary.json").is_file())

    def test_symlinked_results_directory_is_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        self.results.parent.mkdir()
        self.create_symlink(self.results, outside, directory=True)
        with self.assertRaisesRegex(ValueError, "Results directory"):
            report.summarize_results(self.results)
        self.assertEqual([], list(outside.iterdir()))

    def test_symlinked_parent_directory_is_rejected_before_mkdir(self):
        outside = self.root / "outside"
        outside.mkdir()
        self.create_symlink(self.results.parent, outside, directory=True)
        with self.assertRaisesRegex(ValueError, "Results directory"):
            report.summarize_results(self.results)
        self.assertEqual([], list(outside.iterdir()))

    def test_symlinked_report_files_are_rejected_before_reading_or_writing(self):
        self.results.mkdir(parents=True)
        for filename in ("qodana.sarif.json", "inspection-summary.json", "inspection-summary.md"):
            outside = self.root / "outside"
            outside.write_text("unchanged", encoding="utf-8")
            link = self.results / filename
            self.create_symlink(link, outside)
            with (
                self.subTest(filename=filename),
                patch.object(report.Path, "read_text") as read,
                patch.object(report.Path, "write_text") as write,
                self.assertRaisesRegex(ValueError, "Symlinked report files"),
            ):
                report.summarize_results(self.results)
            read.assert_not_called()
            write.assert_not_called()
            self.assertEqual("unchanged", outside.read_text("utf-8"))
            self.assertEqual([filename], [path.name for path in self.results.iterdir()])
            link.unlink()

    def test_dangling_report_symlink_is_rejected(self):
        self.results.mkdir(parents=True)
        outside = self.root / "missing"
        self.create_symlink(self.results / "inspection-summary.json", outside)
        with self.assertRaisesRegex(ValueError, "Symlinked report files"):
            report.summarize_results(self.results)
        self.assertFalse(outside.exists())
        self.assertFalse((self.results / "inspection-summary.md").exists())


class ScanRunnerTests(unittest.TestCase):
    def test_git_commands_are_bounded_and_timeouts_fail(self):
        with (
            patch.object(runner, "executable", return_value="git"),
            patch.object(
                runner.subprocess, "check_output", return_value="/repository/.git\n"
            ) as check_output,
        ):
            self.assertEqual(
                "/repository/.git", runner.git_output(Path("/repository"), "rev-parse")
            )
            self.assertEqual(runner.GIT_TIMEOUT_SECONDS, check_output.call_args.kwargs["timeout"])
            check_output.side_effect = subprocess.TimeoutExpired("git", runner.GIT_TIMEOUT_SECONDS)
            with self.assertRaisesRegex(RuntimeError, "Git command timed out"):
                runner.git_output(Path("/repository"), "rev-parse")

    def test_command_is_unprivileged_git_aware_and_django_scoped(self):
        with (
            patch.object(runner, "git_output", return_value="/repository/.git"),
            patch.object(runner, "executable", side_effect=lambda name: name),
            patch.object(runner.os, "getuid", return_value=1001, create=True),
            patch.object(runner.os, "getgid", return_value=1001, create=True),
        ):
            command = runner.docker_command(
                Path("/repository"), Path("/stage"), IMAGE, "qodana-test"
            )
        self.assertEqual(["docker", "run", "--init", "--name"], command[:4])
        self.assertIn("--cap-drop=ALL", command)
        self.assertIn("--security-opt=no-new-privileges", command)
        self.assertIn("1001:1001", command)
        self.assertIn("GIT_WORK_TREE=/data/workspace", command)
        self.assertIn("GIT_DIR=/opt/project-git", command)
        mounts = [command[i + 1] for i, value in enumerate(command) if value == "--mount"]
        git_mounts = [mount for mount in mounts if "target=/opt/project-git" in mount]
        self.assertEqual(2, len(git_mounts))
        self.assertTrue(all(mount.endswith(",readonly") for mount in git_mounts))
        self.assertFalse(
            any("target=/data/workspace" in m and "source=/repository," in m for m in mounts)
        )
        self.assertIn("--project-dir=/data/workspace/services/python/django", command)
        self.assertIn("--results-dir=/tmp/qodana-results", command)
        self.assertIn("--report-dir=/tmp/qodana-results/report", command)
        self.assertIn("QODANA_PYTHON_PATH=/opt/miniconda3/bin/python3", command)
        self.assertNotIn("--privileged", command)

    def test_root_host_user_is_rejected(self):
        with (
            patch.object(runner, "git_output", return_value="/repository/.git"),
            patch.object(runner.os, "getuid", return_value=0, create=True),
        ):
            with self.assertRaisesRegex(ValueError, "non-root"):
                runner.docker_command(Path("/repository"), Path("/stage"), IMAGE, "qodana-test")

    def test_staging_omits_host_metadata_secrets_and_build_outputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary) / "repository"
            source = workspace / "services/python/django"
            source.mkdir(parents=True)
            (source / "app.py").write_text("pass\n", encoding="utf-8")
            (source / ".env").write_text("secret", encoding="utf-8")
            (source / "module.iml").write_text("host SDK", encoding="utf-8")
            for name in (".idea", ".venv", "__pycache__", "build"):
                (source / name).mkdir()
                (source / name / "ignored").touch()
            (workspace / "unrelated-secret").touch()
            staging = Path(temporary) / "stage"
            runner.stage_project(workspace, staging)
            destination = staging / "workspace/services/python/django"
            self.assertEqual(["app.py"], sorted(path.name for path in destination.iterdir()))
            self.assertFalse((staging / "workspace/unrelated-secret").exists())
            self.assertTrue((source / ".env").exists())
            self.assertEqual(
                "gitdir: /opt/project-git\n",
                (staging / "workspace/.git").read_text(encoding="utf-8"),
            )

    def test_mutable_or_paid_image_is_rejected_before_docker(self):
        with tempfile.TemporaryDirectory() as temporary:
            for image in (
                "jetbrains/qodana-python-community:2026.2",
                "jetbrains/qodana-python:2026.2@sha256:" + "a" * 64,
            ):
                with self.subTest(image=image), self.assertRaisesRegex(ValueError, "Community"):
                    runner.run_scan(Path(temporary), Path(temporary) / "results", image)

    def test_stale_results_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            results = Path(temporary) / "results"
            results.mkdir()
            (results / "qodana.sarif.json").touch()
            with self.assertRaisesRegex(ValueError, "empty"):
                runner.run_scan(Path(temporary), results, IMAGE)

    def test_scan_exports_results_and_cleans_up_even_when_gate_fails(self):
        statuses = ((0, 0, 0, 0), (255, 0, 0, 255), (0, 1, 0, 1), (0, 0, 1, 1))
        for scan_status, copy_status, cleanup_status, expected in statuses:
            with tempfile.TemporaryDirectory() as temporary:
                process = MagicMock()
                process.stdout = io.StringIO("Analyzer diagnostic\n")
                process.wait.return_value = scan_status
                process.poll.return_value = scan_status
                with (
                    self.subTest(scan_status=scan_status, copy_status=copy_status),
                    patch.object(runner, "stage_project"),
                    patch.object(runner, "docker_command", return_value=["docker", "run"]),
                    patch.object(runner.subprocess, "Popen", return_value=process),
                    patch.object(
                        runner.subprocess, "call", side_effect=[copy_status, cleanup_status]
                    ) as call,
                ):
                    results = Path(temporary) / "results"
                    status = runner.run_scan(Path(temporary), results, IMAGE)
                self.assertEqual(expected, status)
                self.assertEqual("cp", call.call_args_list[0].args[0][1])
                self.assertEqual(["rm", "--force"], call.call_args_list[1].args[0][1:3])
                self.assertEqual(
                    runner.COPY_TIMEOUT_SECONDS, call.call_args_list[0].kwargs["timeout"]
                )
                self.assertEqual(
                    runner.REMOVE_TIMEOUT_SECONDS, call.call_args_list[1].kwargs["timeout"]
                )
                self.assertIn("Analyzer diagnostic", (results / "scan.log").read_text("utf-8"))

    def test_scan_copy_and_removal_timeouts_fail_without_skipping_cleanup(self):
        timeout = subprocess.TimeoutExpired("docker", 1)
        cases = (
            (runner.TIMEOUT_STATUS, [0, 0]),
            (0, [timeout, 0]),
            (0, [0, timeout]),
            (runner.TIMEOUT_STATUS, [timeout, timeout]),
            (0, [OSError("daemon unavailable"), 0]),
        )
        for scan_status, commands in cases:
            with (
                self.subTest(scan_status=scan_status, commands=commands),
                tempfile.TemporaryDirectory() as temporary,
                patch.object(runner, "stage_project"),
                patch.object(runner, "docker_command", return_value=["docker", "run"]),
                patch.object(runner, "stream_scan", return_value=scan_status) as scan,
                patch.object(runner.subprocess, "call", side_effect=commands) as call,
            ):
                results = Path(temporary) / "results"
                status = runner.run_scan(Path(temporary), results, IMAGE)
                self.assertNotEqual(0, status)
                self.assertEqual(runner.SCAN_TIMEOUT_SECONDS, scan.call_args.args[2])
                self.assertEqual(["cp", "rm"], [item.args[0][1] for item in call.call_args_list])
                if any(isinstance(item, subprocess.TimeoutExpired) for item in commands):
                    self.assertIn("timed out", (results / "scan.log").read_text("utf-8"))

    def test_scan_exception_still_attempts_bounded_removal(self):
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.object(runner, "stage_project"),
            patch.object(runner, "docker_command", return_value=["docker", "run"]),
            patch.object(runner, "stream_scan", side_effect=OSError("cannot start Docker")),
            patch.object(runner.subprocess, "call", return_value=0) as call,
        ):
            with self.assertRaisesRegex(OSError, "cannot start Docker"):
                runner.run_scan(Path(temporary), Path(temporary) / "results", IMAGE)
            call.assert_called_once()
            self.assertEqual(["rm", "--force"], call.call_args.args[0][1:3])
            self.assertEqual(runner.REMOVE_TIMEOUT_SECONDS, call.call_args.kwargs["timeout"])


class StreamingDeadlineTests(unittest.TestCase):
    def test_silent_partial_continuous_and_closed_output_cannot_defeat_deadline(self):
        programs = (
            "import time; time.sleep(10)",
            "import sys, time; sys.stdout.write('partial'); sys.stdout.flush(); time.sleep(10)",
            "import time\nwhile True:\n print('diagnostic', flush=True)\n time.sleep(0.01)",
            "import os, time; os.close(1); os.close(2); time.sleep(10)",
        )
        real_popen = subprocess.Popen
        processes = []

        def start_process(*args, **kwargs):
            # Test-only, fixed current Python executable and literal programs above.
            process = real_popen(*args, **kwargs)  # noqa: S603
            processes.append(process)
            return process

        for program in programs:
            processes.clear()
            with (
                self.subTest(program=program),
                patch.object(runner.subprocess, "Popen", side_effect=start_process),
                patch("builtins.print"),
            ):
                log = io.StringIO()
                started = time.monotonic()
                self.assertEqual(
                    runner.TIMEOUT_STATUS,
                    runner.stream_scan([sys.executable, "-u", "-c", program], log, 0.4),
                )
                self.assertLess(time.monotonic() - started, 5)
                self.assertIsNotNone(processes[0].poll())
                self.assertIn("Qodana scan timed out", log.getvalue())

    def test_client_reaping_after_timeout_is_also_bounded(self):
        process = MagicMock()
        process.stdout = io.StringIO("")
        process.poll.return_value = None
        process.wait.side_effect = subprocess.TimeoutExpired("docker", 1)
        log = io.StringIO()
        with patch.object(runner.subprocess, "Popen", return_value=process):
            self.assertEqual(runner.TIMEOUT_STATUS, runner.stream_scan(["docker", "run"], log, 1))
        process.kill.assert_called_once()
        self.assertEqual(
            runner.PROCESS_EXIT_TIMEOUT_SECONDS, process.wait.call_args.kwargs["timeout"]
        )
        self.assertIn("did not exit after being killed", log.getvalue())


class WorkflowContractTests(unittest.TestCase):
    def test_results_directory_is_exported_before_scanning(self):
        root = Path(__file__).resolve().parent.parent
        workflow = (root / ".github/workflows/django_python_quality.yml").read_text("utf-8")
        qodana = workflow.split("\n  qodana:\n", 1)[1]
        self.assertNotIn("\n    env:", qodana)
        export = 'echo "RESULTS_DIR=$RUNNER_TEMP/qodana-python/results" >> "$GITHUB_ENV"'
        self.assertIn(export, qodana)
        self.assertLess(qodana.index(export), qodana.index("python scripts/run-qodana-python.py"))
        self.assertIn("${{ runner.temp }}/qodana-python/results/report/", qodana)

    def test_subprocess_deadlines_leave_time_for_ci_setup_and_artifacts(self):
        budget = (
            2 * runner.GIT_TIMEOUT_SECONDS
            + runner.SCAN_TIMEOUT_SECONDS
            + runner.COPY_TIMEOUT_SECONDS
            + runner.REMOVE_TIMEOUT_SECONDS
            + runner.PROCESS_EXIT_TIMEOUT_SECONDS
            + 1
        )
        self.assertLess(budget, 28 * 60)


class CompatibilityProfileTests(unittest.TestCase):
    def test_managed_profile_targets_only_python_313(self):
        root = Path(__file__).resolve().parent.parent
        profile_path = root / "services/python/django/quality/Project_Default.xml"
        # Fixed repository-owned inspection settings, never downloaded report XML.
        profile = ElementTree.parse(profile_path)  # noqa: S314
        inspection = profile.find(".//inspection_tool[@class='PyCompatibilityInspection']")
        self.assertIsNotNone(inspection)
        versions = inspection.findall("./option[@name='ourVersions']/value/list/item")
        self.assertEqual(["3.13"], [item.get("itemvalue") for item in versions])
        settings_path = root / "services/python/django/quality/profiles_settings.xml"
        settings = ElementTree.parse(settings_path)  # noqa: S314
        name = settings.find(".//option[@name='PROJECT_PROFILE']")
        self.assertEqual("Project Default", name.get("value"))


if __name__ == "__main__":
    unittest.main()
