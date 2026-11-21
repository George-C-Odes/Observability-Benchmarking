#!/usr/bin/env python3
"""Install the reviewed APM CLI pin and refresh the repository's agent package."""

import argparse
import hashlib
import importlib.metadata
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import venv

ROOT = Path(__file__).resolve().parents[1]
VALIDATION = (
    ("install", "--frozen"),
    ("compile", "--validate"),
    ("audit", "--ci", "--no-policy"),
    ("pack", "--dry-run"),
)
# Reviewed 0.36 migration: carry the pinned awesome-copilot repository's MIT license.
CATALOG_LICENSE_HASH = "sha256:e32449d23085399adc1222f7a17408b730550258e51627c153cb108ca9955823"


def read_pin(root):
    version = (root / "scripts/apm-version.txt").read_text(encoding="utf-8").strip()
    if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) is None:
        raise ValueError("APM pin must be an exact stable X.Y.Z version")
    return version


def run(arguments, cwd, *, capture=False):
    print(f"[{cwd}] {' '.join(map(str, arguments))}", flush=True)
    result = subprocess.run(
        list(map(str, arguments)), cwd=cwd, check=True, timeout=600,
        text=True, stdout=subprocess.PIPE if capture else None,
    )
    return result.stdout.strip() if capture else None


def runtime_paths(root):
    runtime = root / ".venv-apm"
    binaries = runtime / ("Scripts" if os.name == "nt" else "bin")
    return runtime, binaries / ("python.exe" if os.name == "nt" else "python"), binaries / (
        "apm.exe" if os.name == "nt" else "apm"
    )


def ensure_cli(root, python, apm, version):
    try:
        installed = importlib.metadata.version("apm-cli")
    except importlib.metadata.PackageNotFoundError:
        installed = None
    if installed != version or not apm.is_file():
        print(f"Installing repository APM {version} (previous version: {installed or 'none'}).", flush=True)
        install_options = ["--force-reinstall", "--no-deps"] if installed == version else ["--upgrade"]
        run([python, "-m", "pip", "install", *install_options, "--disable-pip-version-check",
             f"apm-cli=={version}"], root)
    run([python, "-m", "pip", "check"], root)
    reported = run([apm, "--version"], root, capture=True)
    # The banner can include a build revision, with verbose diagnostics on later lines.
    version_line = reported.partition("\n")[0]
    match = re.search(r"\bversion ([0-9]+\.[0-9]+\.[0-9]+)(?: \([0-9a-f]{7,40}\))?\Z", version_line)
    if match is None or match[1] != version:
        raise ValueError(f"Unexpected APM CLI version from {apm}: {reported!r}")
    print(f"Using repository APM {version} at {apm}.", flush=True)


def load_lock(path):
    # PyYAML is supplied by the pinned APM environment, never by the host Python.
    import yaml

    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("dependencies"), list):
        raise ValueError(f"Invalid APM lockfile: {path}")
    # Match APM's schema reader for omitted versions and unquoted integers.
    version = data.get("lockfile_version", "1")
    data["lockfile_version"] = str(version) if type(version) is int else version
    return data


def dependency_provenance(dependency):
    result = dict(dependency)
    licenses = result.get("carried_licenses")
    if licenses == [{"path": "LICENSE", "source": "LICENSE", "hash": CATALOG_LICENSE_HASH}]:
        # Permit only the reviewed additive license deployment, never skill changes.
        name = result["name"]
        paths = {f"{target}/skills/{name}/LICENSE" for target in (".agents", ".claude")}
        hashes = result.get("deployed_file_hashes", {})
        if any(hashes.get(path) != CATALOG_LICENSE_HASH for path in paths):
            raise ValueError("Carried license deployment does not match the reviewed hash")
        result.pop("carried_licenses")
        result["deployed_files"] = [path for path in result["deployed_files"] if path not in paths]
        result["deployed_file_hashes"] = {path: digest for path, digest in hashes.items() if path not in paths}
    return result


def require_same_dependencies(before, after, *, rehash=False):
    # Includes commit, content hashes, and dependency deployment paths/hashes.
    # Compare independent of upstream serialization order.
    def index(lock):
        result = {}
        for dependency in lock["dependencies"]:
            key = (dependency["repo_url"], dependency.get("virtual_path"), dependency["name"])
            if key in result:
                raise ValueError("Duplicate APM dependency in lockfile")
            provenance = dependency_provenance(dependency)
            if rehash:
                provenance.pop("content_hash", None)
            result[key] = provenance
        return result

    if index(before) != index(after):
        raise ValueError("APM dependency provenance changed; review upstream sources separately")


def verify_v4_migration(apm, candidate_path, original_bytes, candidate):
    # Verify legacy hashes, then have APM promote those same locked bytes to framed hashes.
    stage = candidate_path.parent
    candidate_bytes = candidate_path.read_bytes()
    candidate_path.write_bytes(original_bytes)
    run([apm, "install", "--frozen"], stage)
    if candidate_path.read_bytes() != original_bytes:
        raise ValueError("Frozen APM verification changed the legacy lockfile")
    run([apm, "install", "--no-frozen"], stage)
    promoted = load_lock(candidate_path)
    if promoted.get("lockfile_version") != "4":
        raise ValueError("APM did not promote the verified legacy lockfile to version 4")
    require_same_dependencies(promoted, candidate)
    candidate_path.write_bytes(candidate_bytes)


def managed_hashes(lock):
    hashes = {}
    for dependency in lock["dependencies"]:
        hashes.update(dependency.get("deployed_file_hashes", {}))
    for deployment in lock.get("deployments", []):
        if deployment.get("kind") == "project-relative" and deployment.get("content_hash"):
            hashes[deployment["value"]] = deployment["content_hash"]
    return hashes


def deployment_hash(path):
    # Match APM's UTF-8 CRLF normalization; binary data and bare CR stay visible.
    raw = path.read_bytes()
    if b"\0" not in raw:
        try:
            raw = raw.decode("utf-8").replace("\r\n", "\n").encode("utf-8")
        except UnicodeDecodeError:
            pass
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def require_unmodified_deployments(package, lock, candidate=None, *, require_present=False):
    desired = managed_hashes(candidate) if candidate else {}
    for relative, expected in managed_hashes(lock).items():
        path = package / relative
        if not path.resolve().is_relative_to(package.resolve()):
            raise ValueError(f"Deployment escapes package: {relative}")
        if require_present and not path.is_file():
            raise ValueError(f"Missing deployed file: {relative}")
        if path.exists():
            actual = deployment_hash(path)
            if actual not in (expected, desired.get(relative)):
                raise ValueError(f"Locally modified deployment preserved: {relative}. Reconcile it before refreshing.")


def validate(apm, package):
    for arguments in VALIDATION:
        run([apm, *arguments], package)


def deployment_inventory(lock):
    inventory = {}
    for record in lock.get("deployments", []):
        key = tuple(record.get(field) for field in ("kind", "target", "value", "runtime", "scope"))
        if key in inventory:
            raise ValueError(f"Duplicate deployment record: {record.get('value')}")
        inventory[key] = record
    return inventory


def complete_license_migration(package, stage, candidate, local_inventory, clean_inventory, backups):
    # 0.36's cached install can omit new carried licenses from its old ledger.
    allowed = {f"{target}/skills/{dependency['name']}/LICENSE"
               for dependency in candidate["dependencies"]
               if dependency.get("carried_licenses") == [
                   {"path": "LICENSE", "source": "LICENSE", "hash": CATALOG_LICENSE_HASH}]
               for target in (".agents", ".claude")}
    for key in clean_inventory.keys() - local_inventory.keys():
        record = clean_inventory[key]
        relative = record.get("value")
        if relative not in allowed or record.get("content_hash") != CATALOG_LICENSE_HASH:
            continue
        destination = package / relative
        if not destination.resolve().is_relative_to(package.resolve()):
            raise ValueError(f"License deployment escapes package: {relative}")
        if deployment_hash(stage / relative) != CATALOG_LICENSE_HASH:
            raise ValueError(f"Unexpected staged license: {relative}")
        if destination.exists():
            if deployment_hash(destination) != CATALOG_LICENSE_HASH:
                raise ValueError(f"Locally modified license preserved: {relative}")
            # Let APM materialize it and establish its local trust baseline.
            # A copied file plus a copied lock does not establish that baseline.
            backup = stage / ".previous-licenses" / relative
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(destination), str(backup))
            backups[destination] = backup
        local_inventory[key] = record


def refresh(root, apm, version):
    package = root / "my-agent"
    lock_path = package / "apm.lock.yaml"
    original_bytes = lock_path.read_bytes()
    original = load_lock(lock_path)
    # No in-place lock removal: APM needs ownership records to reconcile deployments.
    with tempfile.TemporaryDirectory(prefix="obbench-apm-") as directory:
        stage = Path(directory)
        shutil.copy2(package / "apm.yml", stage / "apm.yml")
        shutil.copytree(package / ".apm", stage / ".apm")
        run([apm, "install"], stage)
        candidate_path = stage / "apm.lock.yaml"
        candidate = load_lock(candidate_path)
        if candidate.get("apm_version") != version:
            raise ValueError("Staged lockfile does not record the pinned CLI version")
        migrating_hashes = (
            original.get("lockfile_version") in ("1", "2", "3") and candidate.get("lockfile_version") == "4"
        )
        require_same_dependencies(original, candidate, rehash=migrating_hashes)
        if migrating_hashes:
            verify_v4_migration(apm, candidate_path, original_bytes, candidate)
        # A retry may encounter outputs already refreshed before a prior failure.
        require_unmodified_deployments(package, original, candidate)
        validate(apm, stage)
        license_backups = {}
        try:
            clean_inventory = deployment_inventory(candidate)
            complete_license_migration(
                package, stage, candidate, deployment_inventory(original), clean_inventory, license_backups
            )
            # The validated candidate includes the license source selection needed
            # to rehydrate old caches. Existing APM local trust records stay in place.
            shutil.copyfile(candidate_path, lock_path)
            install = [apm, "install"]
            # APM 0.37 defaults to frozen in CI when a lockfile exists.
            if tuple(map(int, version.split("."))) >= (0, 37, 0):
                install.append("--no-frozen")
            run(install, package)
            reconciled = load_lock(lock_path)
            require_same_dependencies(candidate, reconciled)
            local_inventory = deployment_inventory(reconciled)
            if local_inventory != clean_inventory:
                differences = {
                    str(key): [field for field in set(local_inventory.get(key, {})) | set(clean_inventory.get(key, {}))
                               if local_inventory.get(key, {}).get(field) != clean_inventory.get(key, {}).get(field)]
                    for key in local_inventory.keys() | clean_inventory.keys()
                    if local_inventory.get(key) != clean_inventory.get(key)
                }
                raise ValueError(f"Local deployments differ from clean staging; check skipped/unmanaged files: {differences}")
            # Copy only a generated, validated replacement; do not hand-edit metadata.
            shutil.copyfile(candidate_path, lock_path)
            validate(apm, package)
            require_unmodified_deployments(package, candidate, require_present=True)
        except BaseException:
            lock_path.write_bytes(original_bytes)
            for destination, backup in license_backups.items():
                if not destination.exists():
                    shutil.copyfile(backup, destination)
            print("Restored original lockfile. Generated deployments may have refreshed; inspect before retrying.",
                  file=sys.stderr)
            raise
    print(f"APM {version}: agent deployments refreshed and all four validation checks passed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Show the plan without writing or using the network")
    args = parser.parse_args()
    version = read_pin(ROOT)
    runtime, python, apm = runtime_paths(ROOT)
    if args.dry_run:
        print(f"Install apm-cli=={version} from scripts/apm-version.txt into the repository environment.")
        print(f"Repository CLI: {apm}")
        print("Stage a fresh lock and verify dependency commits, content and deployment paths.")
        print("Validate clean staging, then reconcile and validate my-agent deployments:")
        for arguments in VALIDATION:
            print("  apm " + " ".join(arguments))
        return
    if sys.version_info < (3, 11):
        raise ValueError("APM requires Python 3.11 or newer")
    if Path(sys.prefix).resolve() != runtime.resolve():
        if not python.is_file():
            venv.EnvBuilder(with_pip=True).create(runtime)
        run([python, Path(__file__).resolve()], ROOT)
        return
    print(f"Repository APM version from scripts/apm-version.txt: {version}", flush=True)
    ensure_cli(ROOT, python, apm, version)
    refresh(ROOT, apm, version)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"APM refresh failed: {error}", file=sys.stderr)
        sys.exit(1)
