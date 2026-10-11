"""Local, bounded Show Me screen clips and sampled visual evidence for chat."""

from __future__ import annotations

import base64
import binascii
import json
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

MAX_CLIPS = 25
MAX_VIDEO_BYTES = 30 * 1024 * 1024
MAX_FRAME_BYTES = 500 * 1024
MAX_FRAMES = 16
STORE = Path(__file__).resolve().parent / "output" / "show-me"
RECENT = STORE / "recent"
_lock = Lock()
_ID = re.compile(r"^clip-\d{6}$")


def _decode(value: object, label: str, limit: int) -> bytes:
    if not isinstance(value, str) or not value.startswith("data:") or ";base64," not in value:
        raise ValueError(f"{label} must be base64 media data.")
    try:
        raw = base64.b64decode(value.rsplit(";base64,", 1)[1], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"{label} has invalid base64 data.") from exc
    if not raw or len(raw) > limit:
        raise ValueError(f"{label} exceeds the local clip limit.")
    return raw


def _metadata(folder: Path) -> dict | None:
    try:
        return json.loads((folder / "metadata.json").read_text())
    except (OSError, ValueError):
        return None


def list_clips() -> list[dict]:
    with _lock:
        folders = sorted(RECENT.glob("clip-??????"), reverse=True) if RECENT.exists() else []
        return [item for folder in folders if (item := _metadata(folder)) is not None]


def save_clip(payload: dict) -> dict:
    mime = str(payload.get("mimeType", "")).split(";", 1)[0].lower()
    if mime not in {"video/webm", "video/mp4"}:
        raise ValueError("This browser's recording format is not supported.")
    duration = payload.get("durationMs")
    if not isinstance(duration, (int, float)) or not 0 < duration <= 30_500:
        raise ValueError("Show Me clips must be 30 seconds or shorter.")
    title = str(payload.get("title", "Screen recording")).strip()[:100] or "Screen recording"
    raw = _decode(payload.get("video"), "Recording", MAX_VIDEO_BYTES)
    if mime == "video/webm" and not raw.startswith(b"\x1a\x45\xdf\xa3"):
        raise ValueError("Recording does not match WebM format.")
    if mime == "video/mp4" and (len(raw) < 12 or raw[4:8] != b"ftyp"):
        raise ValueError("Recording does not match MP4 format.")
    frame_values = payload.get("frames")
    if not isinstance(frame_values, list) or not 1 <= len(frame_values) <= MAX_FRAMES:
        raise ValueError("A recording needs 1–16 visual sample frames.")
    frames = []
    sample_times = []
    for index, item in enumerate(frame_values):
        data = item.get("data") if isinstance(item, dict) else item
        at_ms = item.get("atMs") if isinstance(item, dict) else None
        if at_ms is not None and (not isinstance(at_ms, int) or isinstance(at_ms, bool)
                                  or not 0 <= at_ms <= min(30_000, round(duration))
                                  or (sample_times and sample_times[-1] is not None and at_ms <= sample_times[-1])):
            raise ValueError("Visual sample timestamps must increase within the clip.")
        frames.append(_decode(data, f"Frame {index + 1}", MAX_FRAME_BYTES))
        sample_times.append(at_ms)
    if any(not frame.startswith(b"\xff\xd8\xff") for frame in frames):
        raise ValueError("Visual samples must be JPEG images.")
    with _lock:
        RECENT.mkdir(parents=True, exist_ok=True)
        counter_path = STORE / "next-version.txt"
        try:
            version = int(counter_path.read_text())
        except (OSError, ValueError):
            version = max((int(path.name[-6:]) for path in RECENT.glob("clip-??????") if _ID.fullmatch(path.name)), default=0) + 1
        identifier = f"clip-{version:06d}"
        folder = RECENT / identifier
        if folder.exists():
            raise ValueError("Clip version collision; retry the recording.")
        folder.mkdir()
        extension = "webm" if mime == "video/webm" else "mp4"
        metadata = {
            "id": identifier, "version": version, "title": title,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "durationMs": round(duration), "mimeType": mime,
            "audio": bool(payload.get("audio")), "bytes": len(raw),
            "frameCount": len(frames), "videoUrl": f"/api/show-me/clips/{identifier}/video",
            "file": f"recording.{extension}",
        }
        if all(at_ms is not None for at_ms in sample_times):
            metadata["sampleTimesMs"] = sample_times
        try:
            (folder / metadata["file"]).write_bytes(raw)
            for index, frame in enumerate(frames):
                (folder / f"frame-{index + 1:02d}.jpg").write_bytes(frame)
            (folder / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
            counter_path.write_text(str(version + 1))
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        folders = sorted(RECENT.glob("clip-??????"), reverse=True)
        for old in folders[MAX_CLIPS:]:
            if _ID.fullmatch(old.name):
                shutil.rmtree(old)
        return metadata


def get_video(identifier: str) -> tuple[Path, str]:
    if not _ID.fullmatch(identifier):
        raise FileNotFoundError(identifier)
    with _lock:
        metadata = _metadata(RECENT / identifier)
        if not metadata:
            raise FileNotFoundError(identifier)
        path = RECENT / identifier / metadata["file"]
        if not path.is_file():
            raise FileNotFoundError(identifier)
        return path, metadata["mimeType"]


def stage_frames(identifier: str, data_directory: Path) -> tuple[tempfile.TemporaryDirectory, list[Path], dict]:
    if not _ID.fullmatch(identifier):
        raise ValueError("Choose a saved Show Me clip.")
    with _lock:
        folder = RECENT / identifier
        metadata = _metadata(folder)
        if not metadata:
            raise ValueError("That Show Me clip is no longer in Recent.")
        frames = sorted(folder.glob("frame-??.jpg"))[:MAX_FRAMES]
        if not frames:
            raise ValueError("That clip has no visual samples.")
        data_directory.mkdir(parents=True, exist_ok=True)
        temporary = tempfile.TemporaryDirectory(prefix="show-me-turn-", dir=data_directory)
        targets = []
        for frame in frames:
            target = Path(temporary.name) / frame.name
            shutil.copyfile(frame, target)
            targets.append(target)
        return temporary, targets, metadata
