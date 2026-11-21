"""Offline failure-boundary tests for the APM refresh lifecycle."""

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("upgrade_apm", Path(__file__).with_name("upgrade-apm.py"))
apm = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(apm)


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / "my-agent"
        (self.package / ".apm").mkdir(parents=True)
        (self.package / ".apm/source.md").write_text("authored", encoding="utf-8")
        (self.package / "apm.yml").write_text("manifest", encoding="utf-8")
        self.lock_path = self.package / "apm.lock.yaml"
        self.original = {
            "apm_version": "0.34.0",
            "dependencies": [{"repo_url": "github/catalog", "virtual_path": "skills/test",
                              "name": "test", "resolved_commit": "a" * 40,
                              "content_hash": "sha256:source"}],
            "deployments": [],
        }
        self.candidate = copy.deepcopy(self.original)
        self.candidate["apm_version"] = "0.35.1"
        self.lock_path.write_text(json.dumps(self.original), encoding="utf-8")
        self.original_bytes = self.lock_path.read_bytes()
        self.calls = []

    def fake_run(self, arguments, cwd, **_):
        arguments = list(arguments)[1:]
        self.calls.append((arguments, cwd))
        if arguments == ["install"]:
            self.assertTrue((cwd / ".apm/source.md").is_file())
            lock = copy.deepcopy(self.candidate)
            if cwd == self.package:
                self.assertTrue(self.lock_path.is_file(), "Keep ownership records during reconciliation")
                lock["apm_version"] = "0.34.0"
            (cwd / "apm.lock.yaml").write_text(json.dumps(lock), encoding="utf-8")

    def invoke(self, runner=None):
        with patch.object(apm, "run", side_effect=runner or self.fake_run), patch.object(
            apm, "load_lock", side_effect=lambda path: json.loads(path.read_text(encoding="utf-8"))
        ):
            apm.refresh(self.root, "pinned-apm", "0.35.1")

    def test_success_stages_then_reconciles_and_validates_both(self):
        self.invoke()
        self.assertEqual(json.loads(self.lock_path.read_text()), self.candidate)
        expected = [["install"], *[list(command) for command in apm.VALIDATION]]
        self.assertEqual([call[0] for call in self.calls], expected * 2)
        self.assertNotEqual(self.calls[0][1], self.package)
        self.assertFalse(self.calls[0][1].exists(), "Staging must be cleaned up")

    def test_changed_dependency_rejected_before_local_mutation(self):
        self.candidate["dependencies"][0]["resolved_commit"] = "b" * 40
        with self.assertRaisesRegex(ValueError, "provenance"):
            self.invoke()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.lock_path.read_bytes(), self.original_bytes)

    def prepare_v4_migration(self):
        self.original["lockfile_version"] = "1"
        self.candidate["lockfile_version"] = "4"
        self.candidate["dependencies"][0]["content_hash"] = "sha256:framed"
        self.lock_path.write_text(json.dumps(self.original), encoding="utf-8")
        self.original_bytes = self.lock_path.read_bytes()

    def test_v4_migration_replays_legacy_lock_before_promoting(self):
        self.prepare_v4_migration()

        def verify(arguments, cwd, **kwargs):
            if len(self.calls) in (1, 2):
                self.assertNotEqual(cwd, self.package)
                self.assertEqual((cwd / self.lock_path.name).read_bytes(), self.original_bytes)
            self.fake_run(arguments, cwd, **kwargs)

        self.invoke(verify)
        self.assertEqual([command for command, _ in self.calls[:3]], [["install"], ["install", "--frozen"], ["install"]])
        self.assertEqual(json.loads(self.lock_path.read_text()), self.candidate)

    def test_v4_migration_rejects_a_digest_that_promotion_cannot_reproduce(self):
        self.prepare_v4_migration()

        def change_promoted_hash(arguments, cwd, **kwargs):
            self.fake_run(arguments, cwd, **kwargs)
            if len(self.calls) == 3:
                promoted = copy.deepcopy(self.candidate)
                promoted["dependencies"][0]["content_hash"] = "sha256:different"
                (cwd / self.lock_path.name).write_text(json.dumps(promoted), encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "provenance"):
            self.invoke(change_promoted_hash)
        self.assertTrue(all(cwd != self.package for _, cwd in self.calls))
        self.assertEqual(self.lock_path.read_bytes(), self.original_bytes)

    def test_v4_migration_rejects_a_changed_dependency_pin_before_replaying(self):
        self.prepare_v4_migration()
        self.candidate["dependencies"][0]["resolved_commit"] = "b" * 40
        with self.assertRaisesRegex(ValueError, "provenance"):
            self.invoke()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.lock_path.read_bytes(), self.original_bytes)

    def test_reviewed_license_migration_preserves_skill_provenance(self):
        dependency = self.original["dependencies"][0]
        dependency["deployed_files"] = [".agents/skills/test/SKILL.md"]
        dependency["deployed_file_hashes"] = {".agents/skills/test/SKILL.md": "sha256:skill"}
        migrated = copy.deepcopy(self.original)
        changed = migrated["dependencies"][0]
        changed["carried_licenses"] = [{"path": "LICENSE", "source": "LICENSE", "hash": apm.CATALOG_LICENSE_HASH}]
        for target in (".agents", ".claude"):
            path = f"{target}/skills/test/LICENSE"
            changed["deployed_files"].append(path)
            changed["deployed_file_hashes"][path] = apm.CATALOG_LICENSE_HASH
        apm.require_same_dependencies(self.original, migrated)
        changed["deployed_file_hashes"][".agents/skills/test/SKILL.md"] = "sha256:changed"
        with self.assertRaisesRegex(ValueError, "provenance"):
            apm.require_same_dependencies(self.original, migrated)
        changed["deployed_file_hashes"][".agents/skills/test/LICENSE"] = "sha256:changed"
        with self.assertRaisesRegex(ValueError, "license"):
            apm.require_same_dependencies(self.original, migrated)

    def test_staging_validation_failure_leaves_original_lock(self):
        def fail(arguments, cwd, **kwargs):
            if list(arguments)[1:] == ["audit", "--ci", "--no-policy"]:
                raise subprocess.CalledProcessError(1, arguments)
            self.fake_run(arguments, cwd, **kwargs)

        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke(fail)
        self.assertEqual(self.lock_path.read_bytes(), self.original_bytes)
        self.assertTrue(all(cwd != self.package for _, cwd in self.calls))

    def test_local_failure_restores_original_lock(self):
        def fail(arguments, cwd, **kwargs):
            if cwd == self.package and list(arguments)[1:] == ["install", "--frozen"]:
                raise subprocess.CalledProcessError(1, arguments)
            self.fake_run(arguments, cwd, **kwargs)

        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke(fail)
        self.assertEqual(self.lock_path.read_bytes(), self.original_bytes)

    def test_skipped_deployment_inventory_rejected(self):
        def skip(arguments, cwd, **kwargs):
            self.fake_run(arguments, cwd, **kwargs)
            if cwd == self.package and list(arguments)[1:] == ["install"]:
                lock = copy.deepcopy(self.candidate)
                lock["deployments"] = [{"value": "skipped"}]
                self.lock_path.write_text(json.dumps(lock), encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "skipped/unmanaged"):
            self.invoke(skip)
        self.assertEqual(self.lock_path.read_bytes(), self.original_bytes)

    def test_modified_deployment_stops_before_local_commands(self):
        self.original["deployments"] = [{
            "kind": "project-relative", "value": "deployed.md",
            "content_hash": "sha256:" + hashlib.sha256(b"original").hexdigest(),
        }]
        self.lock_path.write_text(json.dumps(self.original), encoding="utf-8")
        (self.package / "deployed.md").write_text("local edits", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Locally modified"):
            self.invoke()
        self.assertTrue(all(cwd != self.package for _, cwd in self.calls))
        self.assertEqual((self.package / "deployed.md").read_text(), "local edits")

    def test_traversal_in_deployment_is_rejected(self):
        lock = {"dependencies": [], "deployments": [{
            "kind": "project-relative", "value": "../outside", "content_hash": "sha256:x",
        }]}
        with self.assertRaisesRegex(ValueError, "escapes"):
            apm.require_unmodified_deployments(self.package, lock)

    def test_directory_records_have_no_file_hash(self):
        lock = {"dependencies": [], "deployments": [{
            "kind": "project-relative", "value": ".apm", "content_hash": None,
        }]}
        apm.require_unmodified_deployments(self.package, lock)

    def test_deployment_inventory_is_order_independent_but_checks_content(self):
        records = [{"kind": "project-relative", "value": "a", "content_hash": "a"},
                   {"kind": "project-relative", "value": "b", "content_hash": "b"}]
        self.assertEqual(apm.deployment_inventory({"deployments": records}),
                         apm.deployment_inventory({"deployments": list(reversed(records))}))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            apm.deployment_inventory({"deployments": [records[0], records[0]]})

    def test_hash_matches_apm_line_ending_contract(self):
        path = self.package / "text.md"
        for raw, canonical in [(b"a\r\nb", b"a\nb"), (b"a\rb", b"a\rb"),
                               (b"a\0\r\nb", b"a\0\r\nb"), (b"\xff\r\n", b"\xff\r\n")]:
            path.write_bytes(raw)
            self.assertEqual(apm.deployment_hash(path), "sha256:" + hashlib.sha256(canonical).hexdigest())

    def test_retry_accepts_only_original_or_clean_candidate_content(self):
        path = self.package / "deployed.md"
        path.write_bytes(b"old")
        old = {"dependencies": [], "deployments": [{
            "kind": "project-relative", "value": "deployed.md", "content_hash": apm.deployment_hash(path),
        }]}
        candidate = copy.deepcopy(old)
        path.write_bytes(b"new")
        candidate["deployments"][0]["content_hash"] = apm.deployment_hash(path)
        apm.require_unmodified_deployments(self.package, old, candidate)
        path.write_bytes(b"user edits")
        with self.assertRaisesRegex(ValueError, "Locally modified"):
            apm.require_unmodified_deployments(self.package, old, candidate)

    def test_license_completion_preserves_edits_and_lets_apm_materialize(self):
        stage = self.root / "stage"
        relative = ".agents/skills/test/LICENSE"
        source = stage / relative
        source.parent.mkdir(parents=True)
        source.write_bytes(b"license fixture")
        digest = apm.deployment_hash(source)
        record = {"value": relative, "content_hash": digest}
        candidate = {"dependencies": [{"name": "test", "carried_licenses": [
            {"path": "LICENSE", "source": "LICENSE", "hash": digest}]}]}
        inventory = {}
        with patch.object(apm, "CATALOG_LICENSE_HASH", digest):
            apm.complete_license_migration(self.package, stage, candidate, inventory, {"license": record}, {})
            self.assertFalse((self.package / relative).exists())
            self.assertEqual(inventory, {"license": record})
            (self.package / relative).parent.mkdir(parents=True, exist_ok=True)
            (self.package / relative).write_bytes(b"license fixture")
            backups = {}
            apm.complete_license_migration(self.package, stage, candidate, {}, {"license": record}, backups)
            self.assertFalse((self.package / relative).exists())
            self.assertEqual(backups[self.package / relative].read_bytes(), b"license fixture")
            (self.package / relative).write_bytes(b"local edit")
            with self.assertRaisesRegex(ValueError, "modified license"):
                apm.complete_license_migration(self.package, stage, candidate, {}, {"license": record}, {})
            self.assertEqual((self.package / relative).read_bytes(), b"local edit")

    def test_candidate_missing_file_is_rejected(self):
        candidate = {"dependencies": [], "deployments": [{
            "kind": "project-relative", "value": "missing.md", "content_hash": "sha256:missing",
        }]}
        with self.assertRaisesRegex(ValueError, "Missing deployed"):
            apm.require_unmodified_deployments(self.package, candidate, require_present=True)

    def test_pin_must_be_exact_stable_version(self):
        (self.root / "scripts").mkdir()
        pin = self.root / "scripts/apm-version.txt"
        for value in ["latest", "0.35.1;echo bad", "../0.35.1", "0.36.0rc1"]:
            pin.write_text(value, encoding="utf-8")
            with self.assertRaises(ValueError):
                apm.read_pin(self.root)
        pin.write_text("0.35.1\n", encoding="utf-8")
        self.assertEqual(apm.read_pin(self.root), "0.35.1")

    def test_launch_from_active_repository_environment_upgrades_stale_cli(self):
        runtime, python, executable = apm.runtime_paths(self.root)
        executable.parent.mkdir(parents=True)
        executable.touch()
        with (
            patch.object(apm, "ROOT", self.root),
            patch.object(apm.sys, "argv", ["upgrade-apm.py"]),
            patch.object(apm.sys, "prefix", str(runtime)),
            patch.object(apm, "read_pin", return_value="0.36.1"),
            patch.object(apm.importlib.metadata, "version", return_value="0.36.0"),
            patch.object(apm, "run", side_effect=[None, None, "Agent Package Manager (APM) CLI version 0.36.1"]) as run,
            patch.object(apm, "refresh") as refresh,
        ):
            apm.main()

        self.assertEqual(run.call_args_list[0].args[0], [
            python, "-m", "pip", "install", "--upgrade", "--disable-pip-version-check", "apm-cli==0.36.1",
        ])
        self.assertEqual(run.call_args_list[1].args[0], [python, "-m", "pip", "check"])
        self.assertEqual(run.call_args_list[2].args[0], [executable, "--version"])
        refresh.assert_called_once_with(self.root, executable, "0.36.1")

    def test_cli_must_report_the_exact_pinned_version(self):
        _, python, executable = apm.runtime_paths(self.root)
        executable.parent.mkdir(parents=True)
        executable.touch()
        for reported in (
            "Agent Package Manager (APM) CLI version 0.36.1-rc1\n  Python: 3.13.17",
            "Agent Package Manager (APM) CLI version 0.36.10",
            "Agent Package Manager (APM) CLI version 0.36.0\n  Install path: version 0.36.1",
        ):
            with (
                self.subTest(reported=reported),
                patch.object(apm.importlib.metadata, "version", return_value="0.36.1"),
                patch.object(apm, "run", side_effect=[None, reported]),
                self.assertRaisesRegex(ValueError, "Unexpected APM CLI version"),
            ):
                apm.ensure_cli(self.root, python, executable, "0.36.1")

    def test_cli_can_report_the_release_build_revision_after_the_version(self):
        _, python, executable = apm.runtime_paths(self.root)
        executable.parent.mkdir(parents=True)
        executable.touch()
        with (
            patch.object(apm.importlib.metadata, "version", return_value="0.36.1"),
            patch.object(apm, "run", side_effect=[None, "Agent Package Manager (APM) CLI version 0.36.1 (784d778)"]),
        ):
            apm.ensure_cli(self.root, python, executable, "0.36.1")

    def test_cli_accepts_verbose_version_output(self):
        _, python, executable = apm.runtime_paths(self.root)
        executable.parent.mkdir(parents=True)
        executable.touch()
        for revision in ("", " (784d778)"):
            reported = (
                f"Agent Package Manager (APM) CLI version 0.36.1{revision}\n"
                "  Python:       3.13.17\n"
                "  Platform:     win32-AMD64\n"
                "  Install path: .venv-apm/Lib/site-packages/apm_cli"
            )
            with (
                self.subTest(revision=revision),
                patch.object(apm.importlib.metadata, "version", return_value="0.36.1"),
                patch.object(apm, "run", side_effect=[None, reported]),
            ):
                apm.ensure_cli(self.root, python, executable, "0.36.1")

    def test_command_failure_propagates(self):
        with patch.object(apm.subprocess, "run", side_effect=subprocess.CalledProcessError(7, "apm")):
            with self.assertRaises(subprocess.CalledProcessError):
                apm.run(["apm", "install"], self.package)


if __name__ == "__main__":
    unittest.main()
