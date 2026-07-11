"""YOLO detector for G1 camera frames — Mini Pi + heavy debris."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

from nextwin.config import ROOT_DIR, YOLO_CONF, YOLO_DEVICE, YOLO_MODEL, YOLO_ENABLE

RESCUE_TARGETS = {
    "mini_pi": {"label": "Mini Pi (被压)", "priority": 1, "color": "#f97316", "is_target": True},
    "heavy_debris": {"label": "重物", "priority": 2, "color": "#64748b", "is_target": False},
    "person": {"label": "人员", "priority": 1, "color": "#ef4444", "is_target": True},
}

# COCO / custom alias → rescue class
CLASS_ALIASES = {
    "mini pi": "mini_pi",
    "minipi": "mini_pi",
    "mini_pi": "mini_pi",
    "heavy_debris": "heavy_debris",
    "heavy debris": "heavy_debris",
    "debris": "heavy_debris",
    "person": "person",
}


class YOLODetector:
    """Lazy-load YOLO on first detect to keep server startup fast."""

    def __init__(self, model_path: str | None = None, conf_threshold: float | None = None) -> None:
        self.model_path = self._resolve_model_path(model_path or YOLO_MODEL)
        self.conf_threshold = conf_threshold if conf_threshold is not None else YOLO_CONF
        self.device = YOLO_DEVICE
        self._model = None
        self._available: bool | None = None
        self._init_error = ""

    @staticmethod
    def _resolve_model_path(path: str) -> str:
        p = Path(path)
        if p.is_file():
            return str(p)
        custom = ROOT_DIR / "models" / path
        if custom.is_file():
            return str(custom)
        return path

    def _ensure_model(self) -> None:
        if self._available is not None:
            return
        if not YOLO_ENABLE:
            self._available = False
            self._init_error = "YOLO disabled (NEXTWIN_ENABLE_YOLO=0)"
            return
        try:
            from ultralytics import YOLO

            self._model = YOLO(self.model_path)
            self._available = True
        except Exception as exc:
            self._available = False
            self._init_error = str(exc)

    @property
    def mode(self) -> str:
        self._ensure_model()
        return "yolo" if self._available else "mock"

    @property
    def status(self) -> dict[str, str]:
        self._ensure_model()
        return {
            "mode": self.mode,
            "model": self.model_path,
            "device": self.device,
            "error": self._init_error,
        }

    def detect_view(self, view_name: str, image: np.ndarray) -> list[dict[str, Any]]:
        dets = self.detect(image)
        for d in dets:
            d["view"] = view_name
        return dets

    def detect(self, image: np.ndarray) -> list[dict[str, Any]]:
        self._ensure_model()
        if self._available and self._model:
            return self._detect_yolo(image)
        return self._detect_mock(image)

    def _normalize_class(self, cls_name: str) -> str:
        key = cls_name.lower().strip().replace("-", "_")
        return CLASS_ALIASES.get(key, key)

    def _detect_yolo(self, image: np.ndarray) -> list[dict[str, Any]]:
        results = self._model.predict(
            source=image,
            conf=self.conf_threshold,
            device=self.device,
            verbose=False,
        )
        detections: list[dict[str, Any]] = []
        for r in results:
            names = r.names or {}
            for box in r.boxes:
                cls_id = int(box.cls[0])
                raw_name = names.get(cls_id, str(cls_id))
                cls_name = self._normalize_class(raw_name)
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                meta = RESCUE_TARGETS.get(
                    cls_name,
                    {"label": raw_name, "priority": 5, "color": "#64748b", "is_target": False},
                )
                detections.append({
                    "class": cls_name,
                    "label": meta["label"],
                    "confidence": round(conf, 3),
                    "bbox": [round(v, 1) for v in [x1, y1, x2, y2]],
                    "color": meta["color"],
                    "is_target": meta["is_target"],
                    "priority": meta["priority"],
                    "raw_class": raw_name,
                })
        return detections

    def _detect_mock(self, image: np.ndarray) -> list[dict[str, Any]]:
        """Fallback when YOLO unavailable (no G1 / no weights)."""
        h, w = image.shape[:2]
        orange_ratio = np.mean((image[:, :, 0] > 180) & (image[:, :, 1] > 100) & (image[:, :, 2] < 100))
        gray_ratio = np.mean((image[:, :, 0] > 70) & (image[:, :, 0] < 110))
        detections: list[dict[str, Any]] = []
        if orange_ratio > 0.02:
            detections.append({
                "class": "mini_pi",
                "label": "Mini Pi (被压)",
                "confidence": 0.85,
                "bbox": [w * 0.35, h * 0.45, w * 0.65, h * 0.85],
                "color": "#f97316",
                "is_target": True,
                "priority": 1,
            })
        if gray_ratio > 0.03 or orange_ratio > 0.02:
            detections.append({
                "class": "heavy_debris",
                "label": "重物",
                "confidence": 0.78,
                "bbox": [w * 0.25, h * 0.15, w * 0.75, h * 0.55],
                "color": "#64748b",
                "is_target": False,
                "priority": 2,
            })
        return detections

    def find_rescue_target(self, all_detections: list[dict[str, Any]]) -> tuple[str, dict[str, Any] | None]:
        for d in all_detections:
            if d.get("class") == "mini_pi" or d.get("is_target"):
                return d.get("view", "front"), d
        for d in all_detections:
            if d.get("view") == "front":
                return "front", d
        return "front", None
