"""Verify native Maven policy and local Django coverage command behavior."""

import copy
import os
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import coverage_gate
import django_coverage
import sync_coverage_thresholds as sync


class LocalCoverageTests(unittest.TestCase):
    def test_native_java_policy_matches_every_module(self):
        self.assertEqual(sync.synchronize(check=True), 0)
        ns = {"m": "http://maven.apache.org/POM/4.0.0"}
        for module in coverage_gate.load_modules(coverage_gate.CONFIG).values():
            if module["format"] != "java":
                continue
            pom = coverage_gate.ROOT / module["path"] / "pom.xml"
            root = ET.parse(pom)
            executions = root.findall('.//m:execution[m:id="coverage-check"]', ns)
            self.assertEqual(len(executions), 1)
            check = executions[0]
            self.assertEqual(check.findtext("m:phase", namespaces=ns), "verify")
            self.assertEqual(
                check.findtext(".//m:haltOnFailure", namespaces=ns), "true"
            )
            limits = check.findall(".//m:limit", ns)
            self.assertEqual(len(limits), 2)
            for limit in limits:
                metric = limit.findtext("m:counter", namespaces=ns).lower()
                self.assertAlmostEqual(
                    float(limit.findtext("m:minimum", namespaces=ns)) * 100,
                    module["thresholds"]["lines" if metric == "line" else "branches"],
                )

    def test_renderer_is_idempotent_and_keeps_report_and_custom_exec_file(self):
        modules = coverage_gate.load_modules(coverage_gate.CONFIG)
        module = modules["orchestrator"]
        source = (coverage_gate.ROOT / module["path"] / "pom.xml").read_text(
            encoding="utf-8"
        )
        rendered = sync.render_pom(source, module)
        self.assertEqual(source, rendered)
        self.assertEqual(sync.render_pom(rendered, module), rendered)
        self.assertIn(
            "<dataFile>${project.build.directory}/jacoco-quarkus.exec</dataFile>",
            rendered,
        )
        changed = copy.deepcopy(module)
        changed["thresholds"] = {"lines": 92.5, "branches": 95}
        rendered = sync.render_pom(source, changed)
        self.assertIn("<minimum>0.925</minimum>", rendered)
        self.assertIn("<minimum>0.95</minimum>", rendered)
        self.assertIn("<id>report</id>", rendered)

    def test_invalid_plugin_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            sync.render_pom("<project/>", {"path": "example"})

    def test_django_collects_diagnostics_and_fails_even_if_gate_passes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            runtime = root / "runtime"
            runtime.mkdir()
            stale = runtime / "coverage-summary.json"
            stale.write_text("stale")
            modules = {
                "django-platform": {"path": "runtime"},
                "django-common": {"path": "common"},
            }
            with (
                patch.object(django_coverage, "ROOT", root),
                patch.object(
                    django_coverage.subprocess,
                    "run",
                    side_effect=[
                        SimpleNamespace(returncode=1),
                        SimpleNamespace(returncode=0),
                        SimpleNamespace(returncode=0),
                        SimpleNamespace(returncode=0),
                    ],
                ) as run,
                patch.object(django_coverage, "check", return_value=0) as gate,
            ):
                self.assertEqual(
                    django_coverage.run_runtime("django-platform", modules), 1
                )
                self.assertFalse(stale.exists())
                self.assertEqual(run.call_count, 4)
                self.assertEqual(
                    [call.args[0][3] for call in run.call_args_list],
                    ["run", "json", "xml", "html"],
                )
                self.assertEqual(
                    [call.args[0] for call in gate.call_args_list],
                    ["django-platform", "django-common"],
                )
                for call in run.call_args_list:
                    self.assertEqual(call.args[0][1:3], ["-m", "coverage"])
                    self.assertEqual(call.kwargs["timeout"], 180)

    def test_shared_django_build_checks_shared_scope(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "runtime").mkdir()
            modules = {
                "django-platform": {"path": "runtime"},
                "django-common": {"path": "common"},
            }
            with (
                patch.object(django_coverage, "ROOT", root),
                patch.object(
                    django_coverage.subprocess,
                    "run",
                    return_value=SimpleNamespace(returncode=0),
                ),
                patch.object(django_coverage, "check", return_value=1) as gate,
            ):
                self.assertEqual(
                    django_coverage.run_runtime(
                        "django-platform", modules, common_only=True
                    ),
                    1,
                )
                self.assertEqual(gate.call_count, 1)
                self.assertEqual(gate.call_args.args[0], "django-common")

    def test_django_subprocess_imports_checkout_before_installed_package(self):
        real_run = subprocess.run
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            common = root / django_coverage.COMMON
            installed = root / "site-packages"
            for package in (common, installed / "obbench_django_common"):
                package.mkdir(parents=True)
                (package / "__init__.py").write_text("", encoding="utf-8")
            (installed / "existing_dependency.py").write_text("", encoding="utf-8")
            modules = {"django-common": {"path": "common"}}
            for name, runtime in django_coverage.RUNTIMES.items():
                (root / runtime).mkdir()
                modules[name] = {"path": runtime}

            for name in django_coverage.RUNTIMES:
                for inherited in (None, "", str(installed)):
                    with self.subTest(runtime=name, pythonpath=inherited):

                        def probe_import(command, inherited=inherited, **kwargs):
                            if command[3] == "run":
                                probe = (
                                    "import obbench_django_common; "
                                    "print(obbench_django_common.__file__)"
                                )
                                if inherited:
                                    probe += "; import existing_dependency"
                                result = real_run(
                                    [sys.executable, "-c", probe],
                                    cwd=kwargs["cwd"],
                                    env=kwargs["env"],
                                    timeout=kwargs["timeout"],
                                    capture_output=True,
                                    text=True,
                                    check=True,
                                )
                                self.assertEqual(
                                    Path(result.stdout.strip()), common / "__init__.py"
                                )
                            return SimpleNamespace(returncode=0)

                        environment = dict(os.environ)
                        environment.pop("PYTHONPATH", None)
                        if inherited is not None:
                            environment["PYTHONPATH"] = inherited
                        with (
                            patch.dict(os.environ, environment, clear=True),
                            patch.object(django_coverage, "ROOT", root),
                            patch.object(
                                django_coverage.subprocess,
                                "run",
                                side_effect=probe_import,
                            ),
                            patch.object(django_coverage, "check", return_value=0),
                        ):
                            self.assertEqual(
                                django_coverage.run_runtime(name, modules), 0
                            )


if __name__ == "__main__":
    unittest.main()
