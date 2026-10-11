"""Validate and stage short-lived user files for one local Batty chat turn."""

from __future__ import annotations

import base64
import binascii
import mimetypes
import re
import tempfile
from pathlib import Path
from typing import Any


MAX_FILES = 8
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_TOTAL_BYTES = 12 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".txt", ".md", ".csv", ".tsv", ".json", ".jsonl", ".yaml", ".yml",
    ".toml", ".ini", ".log", ".pdf", ".docx", ".xlsx", ".pptx",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".xml",
    ".sql", ".sh", ".pine", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
SAFE_BASENAME = re.compile(r"[^A-Za-z0-9._() -]+")


def _decode_data(value: Any, label: str, max_bytes: int = MAX_FILE_BYTES) -> bytes:
    if not isinstance(value, str) or not value.startswith("data:") or "," not in value:
        raise ValueError(f"{label} must be a base64 data URL.")
    header, encoded = value.split(",", 1)
    if ";base64" not in header.lower():
        raise ValueError(f"{label} must use base64 encoding.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"{label} is not valid base64 data.") from exc
    if not raw or len(raw) > max_bytes:
        raise ValueError(f"{label} must be between 1 byte and {max_bytes // (1024 * 1024)} MB.")
    return raw


def _verify_image(extension: str, raw: bytes, label: str) -> None:
    signatures = {
        ".png": raw.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": raw.startswith(b"\xff\xd8\xff"),
        ".jpeg": raw.startswith(b"\xff\xd8\xff"),
        ".gif": raw.startswith((b"GIF87a", b"GIF89a")),
        ".webp": len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP",
    }
    if not signatures.get(extension, False):
        raise ValueError(f"{label} does not match its {extension} image type.")


def stage_attachments(payload: dict[str, Any], data_directory: Path) -> dict[str, Any]:
    """Create a temporary directory with validated files; caller must cleanup()."""
    items = payload.get("attachments", [])
    if not isinstance(items, list) or len(items) > MAX_FILES:
        raise ValueError(f"Attach up to {MAX_FILES} files per message.")
    screenshot = payload.get("screenshot")
    if len(items) == 0 and not screenshot:
        return {"temporary": None, "directory": None, "images": [], "files": [], "metadata": []}

    entries: list[tuple[str, bytes, bool, str]] = []
    total = 0
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError("An attachment entry is invalid.")
        original_name = Path(str(item.get("name", "file"))).name[:160]
        extension = Path(original_name).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise ValueError(f"{original_name or 'This file'} has an unsupported file type.")
        raw = _decode_data(item.get("data"), f"Attachment {index + 1}")
        if extension in IMAGE_EXTENSIONS:
            _verify_image(extension, raw, original_name)
        if extension == ".pdf" and not raw.startswith(b"%PDF"):
            raise ValueError(f"{original_name} is not a valid PDF file.")
        total += len(raw)
        if total > MAX_TOTAL_BYTES:
            raise ValueError("Attachments must total 12 MB or less per message.")
        safe_name = SAFE_BASENAME.sub("_", original_name).strip(" .") or f"attachment-{index + 1}{extension}"
        entries.append((safe_name, raw, extension in IMAGE_EXTENSIONS, extension))

    screenshot_bytes = None
    if screenshot:
        screenshot_bytes = _decode_data(screenshot, "Shared-tab screenshot", 3 * 1024 * 1024)
        if not screenshot_bytes.startswith(b"\xff\xd8\xff"):
            raise ValueError("Shared-tab screenshot must be JPEG image data.")
        total += len(screenshot_bytes)
        if total > MAX_TOTAL_BYTES:
            raise ValueError("Attachments and screenshot must total 12 MB or less per message.")
        entries.append(("dashboard-screenshot.jpg", screenshot_bytes, True, ".jpg"))

    data_directory.mkdir(parents=True, exist_ok=True)
    temporary = tempfile.TemporaryDirectory(prefix="batty-turn-", dir=data_directory)
    directory = Path(temporary.name)
    images: list[Path] = []
    files: list[dict[str, str]] = []
    metadata: list[dict[str, Any]] = []
    for index, (name, raw, image, extension) in enumerate(entries):
        path = directory / f"input-{index + 1}{extension}"
        path.write_bytes(raw)
        if image:
            images.append(path)
        else:
            files.append({"path": str(path), "name": name})
        metadata.append({
            "extension": extension.lstrip("."),
            "mediaType": mimetypes.guess_type(name)[0] or "application/octet-stream",
            "bytes": len(raw),
            "image": image,
            "screenshot": name == "dashboard-screenshot.jpg",
        })
    return {
        "temporary": temporary,
        "directory": directory,
        "images": images,
        "files": files,
        "metadata": metadata,
    }
