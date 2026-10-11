"""Focused tests for the explicit Show Me coding handoff."""

import base64
import subprocess
import tempfile
import unittest
from pathlib import Path
from threading import Event
from unittest.mock import patch

import show_me
from show_me_build import BuildBusy, BuildManager


def media(mime, raw):
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


class BuildManagerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "count-dashboard"
        self.root.mkdir()
        for name, value in (
            ("STORE", self.root / "output" / "show-me"),
            ("RECENT", self.root / "output" / "show-me" / "recent"),
        ):
            patcher = patch.object(show_me, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.clip = show_me.save_clip({
            "title": "Build button", "durationMs": 3000, "mimeType": "video/webm",
            "audio": False, "video": media("video/webm", b"\x1a\x45\xdf\xa3sample"),
            "frames": [{"atMs": 500, "data": media("image/jpeg", b"\xff\xd8\xffsample")}],
        })

    def test_runs_explicit_request_with_timed_frame_and_report(self):
        observed = {}

        def runner(command, **kwargs):
            observed.update(command=command, kwargs=kwargs)
            return subprocess.CompletedProcess(command, 0,
                '{"type":"thread.started","thread_id":"thread-123"}\n'
                '{"type":"item.completed","item":{"type":"agent_message","text":"Implemented and checked."}}\n',
                "")

        manager = BuildManager(self.root, runner=runner)
        report = manager.start({"clipId": self.clip["id"], "prompt": "Add a button"})
        manager._thread.join(timeout=5)
        final = manager.get(report["id"])
        self.assertEqual(final["status"], "complete")
        self.assertEqual(final["threadId"], "thread-123")
        self.assertIn("0.5s", observed["kwargs"]["input"])
        self.assertIn("--image", observed["command"])
        self.assertEqual(observed["kwargs"]["cwd"], self.root.parent)
        self.assertFalse(any(self.root.joinpath("data").glob("show-me-turn-*")))

    def test_rejects_second_build_while_one_is_active(self):
        started, release = Event(), Event()

        def runner(command, **kwargs):
            started.set()
            release.wait(timeout=5)
            return subprocess.CompletedProcess(command, 0,
                '{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}\n', "")

        manager = BuildManager(self.root, runner=runner)
        report = manager.start({"clipId": self.clip["id"], "prompt": "First build"})
        try:
            self.assertTrue(started.wait(timeout=5))
            with self.assertRaises(BuildBusy):
                manager.start({"clipId": self.clip["id"], "prompt": "Second build"})
        finally:
            release.set()
            manager._thread.join(timeout=5)
        self.assertEqual(manager.get(report["id"])["status"], "complete")

    def test_invalid_request_and_report_id(self):
        manager = BuildManager(self.root)
        with self.assertRaisesRegex(ValueError, "Describe"):
            manager.start({"clipId": self.clip["id"], "prompt": ""})
        with self.assertRaisesRegex(ValueError, "valid"):
            manager.get("../../private")


if __name__ == "__main__":
    unittest.main()
