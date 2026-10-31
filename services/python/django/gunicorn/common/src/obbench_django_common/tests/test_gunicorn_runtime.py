from __future__ import annotations

import os
import stat
import tempfile
from pathlib import Path
from unittest import TestCase, mock, skipUnless

from obbench_django_common.infrastructure.gunicorn_runtime import prepare_runtime_directories


@skipUnless(hasattr(os, "geteuid"), "Gunicorn requires a POSIX runtime")
class GunicornRuntimeTests(TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.worker_dir = self.root / "heartbeat"
        self.control_dir = self.root / "control"
        self.socket = self.control_dir / "gunicorn.sock"

    def prepare(self) -> None:
        prepare_runtime_directories(str(self.worker_dir), str(self.socket))

    def test_creates_owned_private_directories_and_can_run_again(self) -> None:
        self.prepare()
        self.prepare()
        for directory in (self.worker_dir, self.control_dir):
            with self.subTest(directory=directory):
                info = directory.lstat()
                self.assertTrue(stat.S_ISDIR(info.st_mode))
                self.assertEqual(0o700, stat.S_IMODE(info.st_mode))
                self.assertEqual(os.geteuid(), info.st_uid)
        self.assertFalse(self.socket.exists())

    def test_rejects_relative_paths(self) -> None:
        for worker, socket in (("heartbeat", str(self.socket)), (str(self.worker_dir), "sock")):
            with self.subTest(worker=worker, socket=socket):
                with self.assertRaises(ValueError):
                    prepare_runtime_directories(worker, socket)

    def test_rejects_publicly_accessible_directories_without_changing_permissions(self) -> None:
        for directory in (self.worker_dir, self.control_dir):
            for mode in (0o755, 0o770, 0o777):
                with self.subTest(directory=directory, mode=mode):
                    directory.mkdir(exist_ok=True)
                    directory.chmod(mode)
                    with self.assertRaises(PermissionError):
                        self.prepare()
                    self.assertEqual(mode, stat.S_IMODE(directory.stat().st_mode))
                    directory.chmod(0o700)

    def test_rejects_foreign_owner(self) -> None:
        self.prepare()
        with mock.patch(
            "obbench_django_common.infrastructure.gunicorn_runtime.os.geteuid",
            return_value=os.geteuid() + 1,
        ):
            with self.assertRaises(PermissionError):
                self.prepare()

    def test_rejects_symlinks_without_changing_their_target(self) -> None:
        target = self.root / "target"
        target.mkdir(mode=0o700)
        for directory in (self.worker_dir, self.control_dir):
            with self.subTest(directory=directory):
                directory.symlink_to(target, target_is_directory=True)
                with self.assertRaises(PermissionError):
                    self.prepare()
                self.assertEqual(0o700, stat.S_IMODE(target.stat().st_mode))
                directory.unlink()

    def test_rejects_existing_files(self) -> None:
        for directory in (self.worker_dir, self.control_dir):
            with self.subTest(directory=directory):
                directory.write_text("not a directory", encoding="utf-8")
                with self.assertRaises(FileExistsError):
                    self.prepare()
                directory.unlink()
