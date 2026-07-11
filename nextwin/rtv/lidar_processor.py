"""LiDAR point cloud → 4 directional view images + BEV preview."""

from __future__ import annotations

import base64
from io import BytesIO
from typing import Any

import numpy as np

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Yaw ranges (degrees) for each direction, robot-centric
VIEW_YAW_RANGES = {
    "front": (-45, 45),
    "right": (45, 135),
    "back": (135, 180),  # also -180 to -135 handled below
    "left": (-135, -45),
}


class LidarProcessor:
    """Process Unitree UniLiDAR point cloud into 4 directional views."""

    def __init__(self, img_size: int = 640, max_range: float = 6.0) -> None:
        self.img_size = img_size
        self.max_range = max_range

    def split_4_views(self, points: np.ndarray) -> dict[str, np.ndarray]:
        """Project lidar points into front/right/back/left 2D depth images."""
        views: dict[str, np.ndarray] = {}
        for name, (yaw_min, yaw_max) in VIEW_YAW_RANGES.items():
            if name == "back":
                yaw = np.degrees(np.arctan2(points[:, 1], points[:, 0]))
                mask = (yaw >= 135) | (yaw <= -135)
            else:
                mask = self._yaw_mask(points, yaw_min, yaw_max)
            subset = points[mask] if mask.any() else points[:100]
            views[name] = self._project_view(subset, name)
        return views

    def bev_preview(self, points: np.ndarray) -> np.ndarray:
        """Bird's-eye view RGB preview for dashboard."""
        img = np.zeros((self.img_size, self.img_size, 3), dtype=np.uint8)
        img[:] = [15, 20, 30]

        if len(points) == 0:
            return img

        xs = points[:, 0]
        ys = points[:, 1]
        zs = points[:, 2]

        scale = self.img_size / (2 * self.max_range)
        px = ((xs * scale) + self.img_size / 2).astype(int)
        py = ((-ys * scale) + self.img_size / 2).astype(int)

        valid = (px >= 0) & (px < self.img_size) & (py >= 0) & (py < self.img_size)
        px, py, zs = px[valid], py[valid], zs[valid]

        for x, y, z in zip(px, py, zs):
            intensity = min(255, int(100 + z * 80))
            color = [intensity, intensity // 2, 50] if z > 0.2 else [40, 80, 40]
            img[y, x] = color

        return img

    def merge_with_vision(
        self, lidar_views: dict[str, np.ndarray], vision: np.ndarray
    ) -> dict[str, np.ndarray]:
        """Enhance front view with camera, keep lidar for other directions."""
        from nextwin.rtv.panoramic import PanoramicProcessor

        cam_views = PanoramicProcessor(view_size=self.img_size).split_4_views_from_camera(vision)
        merged = dict(lidar_views)
        if "front" in cam_views:
            merged["front"] = self._blend(cam_views["front"], lidar_views.get("front"))
        return merged

    def encode_thumbnail(self, img: np.ndarray) -> str:
        if not HAS_PIL:
            return ""
        buf = BytesIO()
        Image.fromarray(img).save(buf, format="JPEG", quality=75)
        return base64.b64encode(buf.getvalue()).decode("ascii")

    def bbox_to_scene_position(self, view: str, bbox: list[float], w: int, h: int) -> list[float]:
        cx = (bbox[0] + bbox[2]) / 2 / w - 0.5
        cy = (bbox[1] + bbox[3]) / 2 / h - 0.5
        dist = 2.5 + cy * 1.5
        yaw_map = {"front": 0, "right": 90, "back": 180, "left": -90}
        import math
        yaw = math.radians(yaw_map.get(view, 0))
        return [
            round(dist * math.sin(yaw) + cx * 1.2, 2),
            round(max(0.1, 0.3 - cy * 0.5), 2),
            round(-dist * math.cos(yaw), 2),
        ]

    def _yaw_mask(self, points: np.ndarray, yaw_min: float, yaw_max: float) -> np.ndarray:
        yaw = np.degrees(np.arctan2(points[:, 1], points[:, 0]))
        if yaw_min > yaw_max:  # back wraps around
            return (yaw >= yaw_min) | (yaw <= yaw_max)
        return (yaw >= yaw_min) & (yaw <= yaw_max)

    def _project_view(self, points: np.ndarray, view_name: str) -> np.ndarray:
        img = np.zeros((self.img_size, self.img_size, 3), dtype=np.uint8)
        img[:] = [20, 25, 35]

        if len(points) == 0:
            return img

        xs, ys, zs = points[:, 0], points[:, 1], points[:, 2]
        # Project to 2D: horizontal = lateral, vertical = height
        if view_name in ("front", "back"):
            lateral, depth = ys, xs
            if view_name == "back":
                depth = -depth
        else:
            lateral, depth = xs, ys
            if view_name == "left":
                depth = -depth

        mask = (depth > 0.2) & (depth < self.max_range)
        lateral, zs, depth = lateral[mask], zs[mask], depth[mask]
        if len(lateral) == 0:
            return img

        scale = self.img_size / self.max_range
        px = ((lateral * scale) + self.img_size / 2).astype(int)
        py = (self.img_size - (depth * scale)).astype(int)

        valid = (px >= 0) & (px < self.img_size) & (py >= 0) & (py < self.img_size)
        for x, y, z in zip(px[valid], py[valid], zs[valid]):
            c = min(255, int(80 + z * 120))
            img[y, x] = [c, c // 2, 40]

        return img

    @staticmethod
    def _blend(a: np.ndarray, b: np.ndarray | None, alpha: float = 0.6) -> np.ndarray:
        if b is None:
            return a
        if a.shape != b.shape:
            return a
        return (a.astype(float) * alpha + b.astype(float) * (1 - alpha)).astype(np.uint8)

    def lidar_stats(self, points: np.ndarray) -> dict[str, Any]:
        if len(points) == 0:
            return {"point_count": 0}
        dists = np.linalg.norm(points[:, :2], axis=1)
        return {
            "point_count": len(points),
            "max_range_m": round(float(dists.max()), 2),
            "min_range_m": round(float(dists.min()), 2),
            "centroid": [round(float(c), 2) for c in points.mean(axis=0)],
        }
