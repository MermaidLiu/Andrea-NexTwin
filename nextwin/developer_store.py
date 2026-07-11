"""Developer portal — SDK & world model upload registry."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from nextwin.config import ROOT_DIR

UPLOADS_DIR = ROOT_DIR / "uploads"
SDK_DIR = UPLOADS_DIR / "sdk"
WM_DIR = UPLOADS_DIR / "world_models"
REGISTRY_PATH = UPLOADS_DIR / "registry.json"


def _ensure_dirs() -> None:
    SDK_DIR.mkdir(parents=True, exist_ok=True)
    WM_DIR.mkdir(parents=True, exist_ok=True)


def _load_registry() -> dict[str, list[dict[str, Any]]]:
    _ensure_dirs()
    if REGISTRY_PATH.exists():
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return {"sdk": [], "world_models": []}


def _save_registry(data: dict[str, list[dict[str, Any]]]) -> None:
    _ensure_dirs()
    REGISTRY_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def list_sdk() -> list[dict[str, Any]]:
    return _load_registry().get("sdk", [])


def list_world_models() -> list[dict[str, Any]]:
    return _load_registry().get("world_models", [])


def register_sdk(
    name: str,
    version: str,
    robot: str,
    description: str,
    filename: str | None = None,
) -> dict[str, Any]:
    reg = _load_registry()
    item = {
        "id": f"sdk_{uuid.uuid4().hex[:8]}",
        "name": name,
        "version": version,
        "robot": robot,
        "description": description,
        "filename": filename,
        "status": "review" if filename else "draft",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    reg["sdk"].append(item)
    _save_registry(reg)
    return item


def register_world_model(
    name: str,
    publish_type: str,
    scene: str,
    fidelity: int,
    physics: int,
    description: str,
    filename: str | None = None,
) -> dict[str, Any]:
    reg = _load_registry()
    status = "review" if publish_type == "platform" else ("live" if publish_type == "opensource" else "private")
    item = {
        "id": f"wm_{uuid.uuid4().hex[:8]}",
        "name": name,
        "publish_type": publish_type,
        "scene": scene,
        "fidelity": fidelity,
        "physics": physics,
        "description": description,
        "filename": filename,
        "status": status,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    reg["world_models"].append(item)
    _save_registry(reg)
    return item


def delete_sdk(sdk_id: str) -> bool:
    reg = _load_registry()
    before = len(reg["sdk"])
    reg["sdk"] = [s for s in reg["sdk"] if s["id"] != sdk_id]
    if len(reg["sdk"]) == before:
        return False
    _save_registry(reg)
    return True


async def save_upload_file(file: Any, dest_dir: Path) -> str:
    """Save UploadFile to dest_dir, return filename."""
    _ensure_dirs()
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "upload.bin").name.replace("..", "")
    dest = dest_dir / f"{uuid.uuid4().hex[:8]}_{safe_name}"
    content = await file.read()
    dest.write_bytes(content)
    return dest.name
