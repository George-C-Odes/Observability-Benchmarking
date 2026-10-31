from __future__ import annotations

import tempfile
from pathlib import Path
from unittest import TestCase

from sync_build_locks import (
    generate_locks,
    parse_requirements,
    render_requirements,
    select_hashes,
)

_HASH_A = "--hash=sha256:" + "a" * 64
_HASH_B = "--hash=sha256:" + "b" * 64


class BuildLockTests(TestCase):
    def test_parses_pip_compile_output_and_normalizes_names(self) -> None:
        content = (
            "# header\n--only-binary :all:\n"
            f"My_Package==1.2 \\\n    {_HASH_B} \\\n    {_HASH_A}\n"
            "    # via another-package\n"
        )
        self.assertEqual({"my-package": ("1.2", (_HASH_A, _HASH_B))}, parse_requirements(content))
        self.assertEqual(
            parse_requirements(content), parse_requirements(content.replace("\n", "\r\n"))
        )

    def test_rejects_unpinned_requirements_and_non_hash_options(self) -> None:
        for content in ("package>=1", "-r other.txt", "package==1 --index-url=https://example.org"):
            with self.subTest(content=content):
                with self.assertRaises(ValueError):
                    parse_requirements(content)

    def test_rejects_conflicting_duplicate_pins(self) -> None:
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            parse_requirements("package==1\npackage==2\n")

    def test_hash_selection_requires_matching_versions_and_hashes(self) -> None:
        pins = {"package": ("1", ())}
        for inventory in ({}, {"package": ("2", (_HASH_A,))}, {"package": ("1", ())}):
            with self.subTest(inventory=inventory):
                with self.assertRaisesRegex(ValueError, "Missing matching hashes"):
                    select_hashes(pins, inventory)

    def test_render_round_trip_is_deterministic(self) -> None:
        requirements = {"z-package": ("2", (_HASH_B,)), "a-package": ("1", (_HASH_A,))}
        rendered = render_requirements(requirements, hashes=True)
        self.assertEqual(requirements, parse_requirements(rendered))
        self.assertLess(rendered.index("a-package==1"), rendered.index("z-package==2"))
        self.assertEqual(
            rendered, render_requirements(dict(reversed(list(requirements.items()))), hashes=True)
        )

    def test_render_cannot_emit_unhashed_artifacts(self) -> None:
        with self.assertRaisesRegex(ValueError, "Missing hashes"):
            render_requirements({"package": ("1", ())}, hashes=True)

    def test_projects_only_runtime_and_build_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            gunicorn = workspace / "services/python/django/gunicorn"
            ci = workspace / ".github/requirements"
            for directory in (gunicorn / "WSGI", gunicorn / "ASGI", ci):
                directory.mkdir(parents=True)
            (gunicorn / "WSGI/requirements.txt").write_text("django==1\n", encoding="utf-8")
            (gunicorn / "ASGI/requirements.txt").write_text(
                "django==1\nuvicorn==2\n", encoding="utf-8"
            )
            (ci / "build.in").write_text("setuptools==3\n", encoding="utf-8")
            (ci / "pip.in").write_text("pip==4\n", encoding="utf-8")
            (ci / "pip.txt").write_text(f"pip==4 {_HASH_A}\n", encoding="utf-8")
            (ci / "python-ci.txt").write_text(
                "\n".join(
                    f"{pin} {_HASH_A}"
                    for pin in ("django==1", "uvicorn==2", "setuptools==3", "ruff==5")
                ),
                encoding="utf-8",
            )
            generated = generate_locks(workspace)
            self.assertEqual(
                {"django", "uvicorn", "setuptools"},
                set(parse_requirements(generated[gunicorn / "dependencies.lock"])),
            )
            self.assertEqual(
                {"setuptools": ("3", ())},
                parse_requirements(generated[gunicorn / "build-requirements.txt"]),
            )
            self.assertEqual(
                {"pip": ("4", (_HASH_A,))},
                parse_requirements(generated[gunicorn / "pip-requirements.txt"]),
            )
            (gunicorn / "ASGI/requirements.txt").write_text("django==2\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "pins disagree"):
                generate_locks(workspace)
