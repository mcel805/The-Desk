"""Install CQG's published sample protobuf bindings locally, outside Git."""

from __future__ import annotations

import io
import tarfile
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
DESTINATION = ROOT / ".cqg-protocol"
SAMPLE_COMMIT = "9e2a86531e8476da223f469614434b7a67926732"
ARCHIVE_URL = f"https://github.com/cqg/WebAPIPythonSamples/archive/{SAMPLE_COMMIT}.tar.gz"


def main() -> None:
    if (DESTINATION / "WebAPI" / "webapi_2_pb2.py").is_file():
        print(f"CQG protocol bindings are already installed at {DESTINATION}")
        return
    request = Request(ARCHIVE_URL, headers={"User-Agent": "CountDeskCQGProtocolSetup/1.0"})
    with urlopen(request, timeout=30) as response:
        archive = tarfile.open(fileobj=io.BytesIO(response.read()), mode="r:gz")
    selected = 0
    for member in archive:
        parts = Path(member.name).parts
        if len(parts) != 3 or parts[1] not in {"WebAPI", "common"}:
            continue
        if not parts[2].endswith("_pb2.py") and parts[2] != "__init__.py":
            continue
        source = archive.extractfile(member)
        if source is None:
            continue
        target = DESTINATION / parts[1] / parts[2]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read())
        selected += 1
    if not (DESTINATION / "WebAPI" / "webapi_2_pb2.py").is_file():
        raise RuntimeError("The pinned CQG archive did not contain WebAPI protobuf bindings")
    print(f"Installed {selected} CQG generated protocol modules at {DESTINATION}")
    print("Source: CQG WebAPIPythonSamples, pinned commit", SAMPLE_COMMIT)


if __name__ == "__main__":
    main()
