"""YOLO detector for G1 camera frames — Mini Pi + heavy debris."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

from nextwin.config import ROOT_DIR, YOLO_CONF, YOLO_DEVICE, YOLO_MODEL, YOLO_ENABLE, YOLO_COCO_DEMO

RESCUE_TARGETS = {
    "mini_pi": {"label": "Mini Pi (被压)", "priority": 1, "color": "#f97316", "is_target": True},
    "heavy_debris": {"label": "重物", "priority": 2, "color": "#64748b", "is_target": False},
    "obstacle_box": {"label": "长方体障碍物", "priority": 1, "color": "#eab308", "is_target": True},
    "person": {"label": "人员", "priority": 1, "color": "#ef4444", "is_target": True},
}

# 自定义模型类别名
CLASS_ALIASES = {
    "mini pi": "mini_pi",
    "minipi": "mini_pi",
    "mini_pi": "mini_pi",
    "heavy_debris": "heavy_debris",
    "heavy debris": "heavy_debris",
    "debris": "heavy_debris",
    "obstacle_box": "obstacle_box",
    "obstacle box": "obstacle_box",
    "box": "obstacle_box",
    "person": "person",
}

# COCO yolov8n 演示映射 — 无「纸盒」类，用近义物代替
# Mini Pi 替身：小方块/手机；重物替身：行李箱/椅子/背包等
COCO_DEMO_ALIASES = {
    # → 障碍物 MVP（长方体）
    "suitcase": "obstacle_box",
    "book": "obstacle_box",
    "handbag": "obstacle_box",
    "chair": "obstacle_box",
    # → Mini Pi / 重物（救援）
    "cell phone": "mini_pi",
    "cell_phone": "mini_pi",
    "book": "mini_pi",
    "mouse": "mini_pi",
    "remote": "mini_pi",
    "laptop": "mini_pi",
    "keyboard": "mini_pi",
    # → 重物（压住目标的物体）
    "backpack": "heavy_debris",
    "handbag": "heavy_debris",
    "chair": "heavy_debris",
    "dining table": "heavy_debris",
    "dining_table": "heavy_debris",
    "couch": "heavy_debris",
    "potted plant": "heavy_debris",
    "potted_plant": "heavy_debris",
    "tv": "heavy_debris",
    "microwave": "heavy_debris",
    "oven": "heavy_debris",
    "refrigerator": "heavy_debris",
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
        self.scenario: str = "rescue"

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
        return self._detect_mock(image, self.scenario)

    def _normalize_class(self, cls_name: str) -> str:
        key = cls_name.lower().strip().replace("-", "_")
        if key in CLASS_ALIASES:
            return CLASS_ALIASES[key]
        if YOLO_COCO_DEMO and key in COCO_DEMO_ALIASES:
            return COCO_DEMO_ALIASES[key]
        # 兼容 COCO 带空格类名
        spaced = cls_name.lower().strip()
        if YOLO_COCO_DEMO and spaced in COCO_DEMO_ALIASES:
            return COCO_DEMO_ALIASES[spaced]
        return key

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
                    "demo_mapped": cls_name != raw_name.lower().replace("-", "_"),
                })
        return detections

    def _detect_mock(self, image: np.ndarray, scenario: str = "rescue") -> list[dict[str, Any]]:
        """Fallback when YOLO unavailable (no G1 / no weights)."""
        h, w = image.shape[:2]
        detections: list[dict[str, Any]] = []

        if scenario == "obstacle":
            detections.append({
                "class": "obstacle_box",
                "label": "长方体障碍物",
                "confidence": 0.91,
                "bbox": [w * 0.32, h * 0.38, w * 0.68, h * 0.78],
                "color": "#eab308",
                "is_target": True,
                "priority": 1,
            })
            return detections

        orange_ratio = np.mean((image[:, :, 0] > 180) & (image[:, :, 1] > 100) & (image[:, :, 2] < 100))
        gray_ratio = np.mean((image[:, :, 0] > 70) & (image[:, :, 0] < 110))
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

    def find_target(
        self, all_detections: list[dict[str, Any]], scenario: str = "rescue"
    ) -> tuple[str, dict[str, Any] | None]:
        if scenario == "obstacle":
            for d in all_detections:
                if d.get("class") == "obstacle_box":
                    return d.get("view", "front"), d
            for d in all_detections:
                if d.get("is_target"):
                    return d.get("view", "front"), d
            return "front", None

        return self.find_rescue_target(all_detections)

    def find_rescue_target(self, all_detections: list[dict[str, Any]]) -> tuple[str, dict[str, Any] | None]:
        # 优先 Mini Pi，其次其他 is_target（如 person）
        for d in all_detections:
            if d.get("class") == "mini_pi":
                return d.get("view", "front"), d
        for d in all_detections:
            if d.get("is_target"):
                return d.get("view", "front"), d
        for d in all_detections:
            if d.get("view") == "front":
                return "front", d
        return "front", None
