"""Local, allowlisted skill disclosure for Quant Lab chat.

The exact skill text goes from this checkout to the loopback browser response.
It is not passed through the model chat prompt or MCP tool results.
"""

from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SKILL_FILES = {
    "quant-lab": PROJECT_ROOT / ".agents" / "skills" / "quant-lab" / "SKILL.md",
    "cleo": PROJECT_ROOT / ".agents" / "skills" / "cleo" / "SKILL.md",
}


def requested_skill_file(message: str, active_tab: str) -> str | None:
    if active_tab != "Quant Lab":
        return None
    request = " ".join(message.lower().strip().rstrip(".!?").split())
    if request in {
        "show me your skill file", "show your skill file",
        "what is your skill file", "display your skill file",
        "show me the quant lab skill file", "show me quant lab's skill file",
    }:
        return "quant-lab"
    if request in {"show me cleo's skill file", "show cleo's skill file"}:
        return "cleo"
    return None


def skill_file_response(name: str) -> str:
    if name not in SKILL_FILES:
        raise ValueError("Unknown project skill.")
    path = SKILL_FILES[name]
    label = "Quant Lab" if name == "quant-lab" else "Cleo"
    return f"{label}'s current project skill file: {path.relative_to(PROJECT_ROOT)}\n\n{path.read_text(encoding='utf-8')}"
