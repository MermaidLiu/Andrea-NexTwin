"""360° ERP → 4-view split (front/back/left/right) for YOLO."""

from __future__ import annotations

import base64
import math
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


class PanoramicProcessor:
    """Split ERP 360° panorama into 4 directional perspective views."""

    VIEW_NAMES = ("front", "right", "back", "left")

    def __init__(self, view_size: int = 640) -> None:
        self.view_size = view_size

    def load_image(self, source: str | Path | bytes) -> np.ndarray:
        if not HAS_PIL:
            raise RuntimeError("Pillow required")
        if isinstance(source, bytes):
            img = Image.open(BytesIO(source))
        else:
            img = Image.open(source)
        return np.array(img.convert("RGB"))

    def split_4_views(self, erp: np.ndarray) -> dict[str, np.ndarray]:
        """Split ERP into front/right/back/left (legacy)."""
        h, w = erp.shape[:2]
        views: dict[str, np.ndarray] = {}
        slice_w = w // 4
        offsets = {"front": w // 2 - slice_w // 2, "right": w // 4, "back": 0, "left": 3 * w // 4}
        for name in self.VIEW_NAMES:
            x0 = offsets[name]
            if x0 + slice_w <= w:
                crop = erp[:, x0 : x0 + slice_w]
            else:
                crop = np.concatenate([erp[:, x0:], erp[:, : slice_w - (w - x0)]], axis=1)
            views[name] = self._resize(crop, self.view_size)
        return views

    def split_4_views_from_camera(self, image: np.ndarray) -> dict[str, np.ndarray]:
        """Split Unitree camera frame into 4 directional crops."""
        h, w = image.shape[:2]
        views: dict[str, np.ndarray] = {}
        # Front: center crop; others: left/right/back regions
        cw, ch = w // 3, h // 2
        cx = w // 2 - cw // 2
        views["front"] = self._resize(image[h - ch :, cx : cx + cw], self.view_size)
        views["left"] = self._resize(image[:, : w // 3], self.view_size)
        views["right"] = self._resize(image[:, 2 * w // 3 :], self.view_size)
        views["back"] = self._resize(image[: h // 2, cx : cx + cw], self.view_size)
        return views

    def encode_view_thumbnail(self, view: np.ndarray) -> str:
        if not HAS_PIL:
            return ""
        img = Image.fromarray(view)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return base64.b64encode(buf.getvalue()).decode("ascii")

    def encode_erp_thumbnail(self, erp: np.ndarray, max_w: int = 960) -> str:
        if not HAS_PIL:
            return ""
        h, w = erp.shape[:2]
        scale = min(1.0, max_w / w)
        img = Image.fromarray(erp)
        if scale < 1.0:
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=75)
        return base64.b64encode(buf.getvalue()).decode("ascii")

    def bbox_to_scene_position(self, view: str, bbox: list[float], view_w: int, view_h: int) -> list[float]:
        """Map detection in a view to approximate 3D scene coords."""
        cx = (bbox[0] + bbox[2]) / 2 / view_w - 0.5
        cy = (bbox[1] + bbox[3]) / 2 / view_h - 0.5

        yaw_map = {"front": 0, "right": 90, "back": 180, "left": 270}
        yaw = math.radians(yaw_map.get(view, 0))
        dist = 3.0 + cy * 2

        x = dist * math.sin(yaw) + cx * 1.5
        z = -dist * math.cos(yaw)
        y = max(0.1, 0.5 - cy)
        return [round(x, 2), round(y, 2), round(z, 2)]

    @staticmethod
    def _resize(img: np.ndarray, size: int) -> np.ndarray:
        if not HAS_PIL:
            return img
        pil = Image.fromarray(img)
        pil = pil.resize((size, size), Image.LANCZOS)
        return np.array(pil)

    @staticmethod
    def generate_synthetic_erp() -> np.ndarray:
        """Synthetic ERP for demo — Mini Pi trapped under debris in front view."""
        w, h = 2048, 1024
        erp = np.zeros((h, w, 3), dtype=np.uint8)
        erp[:, :] = [35, 45, 60]
        erp[int(h * 0.55) :, :] = [50, 55, 45]

        # Front region (center): Mini Pi (orange) + heavy debris (gray)
        fx = w // 2
        # Mini Pi blob
        for dy in range(-50, 50):
            for dx in range(-30, 30):
                y, x = int(h * 0.5) + dy, fx + dx
                if 0 <= y < h and 0 <= x < w:
                    erp[y, x] = [220, 140, 60]
        # Heavy debris on top
        for dy in range(-35, 10):
            for dx in range(-50, 50):
                y, x = int(h * 0.42) + dy, fx + dx
                if 0 <= y < h and 0 <= x < w:
                    erp[y, x] = [90, 90, 95]

        return erp
