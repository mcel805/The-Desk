"""Bounded local Show Me clip retention and chat frame staging."""

import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import show_me


def media(mime: str, raw: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


class ShowMeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name, value in (("STORE", self.root / "output"), ("RECENT", self.root / "output" / "recent")):
            patcher = patch.object(show_me, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.payload = {
            "title": "Chart hover",
            "durationMs": 30_000,
            "mimeType": "video/webm",
            "audio": False,
            "video": media("video/webm", b"\x1a\x45\xdf\xa3sample"),
            "frames": [media("image/jpeg", b"\xff\xd8\xffsample")],
        }

    def test_version_retention_and_chat_frames(self):
        for _ in range(26):
            latest = show_me.save_clip(self.payload)
        self.assertEqual(latest["version"], 26)
        self.assertEqual(latest["durationMs"], 30_000)
        self.assertEqual(len(show_me.list_clips()), 25)
        self.assertEqual(show_me.list_clips()[0]["id"], "clip-000026")
        self.assertFalse((show_me.RECENT / "clip-000001").exists())
        temporary, frames, metadata = show_me.stage_frames("clip-000026", self.root / "data")
        try:
            self.assertEqual(metadata["title"], "Chart hover")
            self.assertEqual(frames[0].read_bytes(), b"\xff\xd8\xffsample")
        finally:
            temporary.cleanup()
        self.assertFalse(frames[0].exists())
        self.assertEqual(show_me.get_video("clip-000026")[1], "video/webm")

    def test_rejects_oversize_duration_and_malformed_media(self):
        with self.assertRaisesRegex(ValueError, "30 seconds"):
            show_me.save_clip({**self.payload, "durationMs": 31_000})
        with self.assertRaisesRegex(ValueError, "WebM"):
            show_me.save_clip({**self.payload, "video": media("video/webm", b"bad")})
        with self.assertRaisesRegex(ValueError, "JPEG"):
            show_me.save_clip({**self.payload, "frames": [media("image/jpeg", b"bad")]})
        with self.assertRaisesRegex(ValueError, "Choose"):
            show_me.stage_frames("../../secrets", self.root / "data")

    def test_media_data_url_with_codec_comma(self):
        payload = {**self.payload, "video": media("video/webm;codecs=vp8,opus", b"\x1a\x45\xdf\xa3sample")}
        self.assertEqual(show_me.save_clip(payload)["id"], "clip-000001")

    def test_timed_samples_and_limit(self):
        frame = media("image/jpeg", b"\xff\xd8\xffsample")
        frames = [{"atMs": index * 2000, "data": frame} for index in range(16)]
        clip = show_me.save_clip({**self.payload, "frames": frames})
        self.assertEqual(clip["sampleTimesMs"], [index * 2000 for index in range(16)])
        with self.assertRaisesRegex(ValueError, "1–16"):
            show_me.save_clip({**self.payload, "frames": frames + frames[:1]})
        with self.assertRaisesRegex(ValueError, "timestamps"):
            show_me.save_clip({**self.payload, "frames": [frames[1], frames[0]]})


if __name__ == "__main__":
    unittest.main()
