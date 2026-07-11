"""YOLO detector — Mini Pi + heavy debris recognition."""

from __future__ import annotations

import os
import random
from pathlib import Path
from typing import Any

import numpy as np

RESCUE_TARGETS = {
    "mini_pi": {"label": "Mini Pi (被压)", "priority": 1, "color": "#f97316", "is_target": True},
    "heavy_debris": {"label": "重物", "priority": 2, "color": "#64748b", "is_target": False},
    "person": {"label": "人员", "priority": 1, "color": "#ef4444", "is_target": True},
}


class YOLODetector:
    def __init__(self, model_path: str = "yolov8n.pt", conf_threshold: float = 0.25) -> None:
        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self._model = None
        self._available = False
        if os.getenv("NEXTWIN_ENABLE_YOLO", "0") == "1":
            self._init_model()

    def _init_model(self) -> None:
        try:
            from ultralytics import YOLO
            self._model = YOLO(self.model_path)
            self._available = True
        except Exception:
            self._available = False

    @property
    def mode(self) -> str:
        return "yolo" if self._available else "mock"

    def detect_view(self, view_name: str, image: np.ndarray) -> list[dict[str, Any]]:
        dets = self.detect(image)
        for d in dets:
            d["view"] = view_name
        return dets

    def detect(self, image: np.ndarray) -> list[dict[str, Any]]:
        if self._available and self._model:
            return self._detect_yolo(image)
        return self._detect_mock(image)

    def _detect_yolo(self, image: np.ndarray) -> list[dict[str, Any]]:
        results = self._model.predict(source=image, conf=self.conf_threshold, verbose=False)
        detections = []
        for r in results:
            names = r.names or {}
            for box in r.boxes:
                cls_id = int(box.cls[0])
                cls_name = names.get(cls_id, str(cls_id))
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                meta = RESCUE_TARGETS.get(cls_name, {"label": cls_name, "priority": 5, "color": "#64748b", "is_target": False})
                detections.append({
                    "class": cls_name,
                    "label": meta["label"],
                    "confidence": round(conf, 3),
                    "bbox": [round(v, 1) for v in [x1, y1, x2, y2]],
                    "color": meta["color"],
                    "is_target": meta["is_target"],
                    "priority": meta["priority"],
                })
        return detections

    def _detect_mock(self, image: np.ndarray) -> list[dict[str, Any]]:
        h, w = image.shape[:2]
        rng = random.Random(w + h)
        detections = []

        # Check if image has orange-ish pixels (Mini Pi in synthetic ERP front view)
        orange_ratio = np.mean((image[:, :, 0] > 180) & (image[:, :, 1] > 100) & (image[:, :, 2] < 100))
        gray_ratio = np.mean((image[:, :, 0] > 70) & (image[:, :, 0] < 110))

        if orange_ratio > 0.02:
            detections.append({
                "class": "mini_pi",
                "label": "Mini Pi (被压)",
                "confidence": round(0.85 + rng.random() * 0.1, 3),
                "bbox": [w * 0.35, h * 0.45, w * 0.65, h * 0.85],
                "color": "#f97316",
                "is_target": True,
                "priority": 1,
            })
        if gray_ratio > 0.03 or orange_ratio > 0.02:
            detections.append({
                "class": "heavy_debris",
                "label": "重物",
                "confidence": round(0.78 + rng.random() * 0.12, 3),
                "bbox": [w * 0.25, h * 0.15, w * 0.75, h * 0.55],
                "color": "#64748b",
                "is_target": False,
                "priority": 2,
            })

        return detections

    def find_rescue_target(self, all_detections: list[dict[str, Any]]) -> tuple[str, dict[str, Any] | None]:
        """Return (view_name, target_detection) for Mini Pi."""
        for d in all_detections:
            if d.get("class") == "mini_pi" or d.get("is_target"):
                return d.get("view", "front"), d
        # Fallback: front view with mock
        for d in all_detections:
            if d.get("view") == "front":
                return "front", d
        return "front", None
