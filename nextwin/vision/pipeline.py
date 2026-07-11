"""Vision pipeline — G1 camera frame → 4-view split (capture via UnitreeSensorBridge)."""

from __future__ import annotations

from typing import Any

import numpy as np

from nextwin.config import RTV_VIEW_SIZE
from nextwin.rtv.panoramic import PanoramicProcessor


class VisionPipeline:
    """Layer 1: split G1 RealSense frames into 4 directional views."""

    def __init__(self) -> None:
        self.splitter = PanoramicProcessor(view_size=RTV_VIEW_SIZE)
        self.last_frame: np.ndarray | None = None
        self.last_source: str = ""

    @property
    def status(self) -> dict[str, str]:
        return {
            "layer": "vision",
            "camera": self.last_source or "g1_realsense_d435i",
            "backend": "Unitree G1 ROS2 / SDK2",
        }

    def split_views(self, frame: np.ndarray) -> dict[str, np.ndarray]:
        self.last_frame = frame
        return self.splitter.split_4_views_from_camera(frame)

    def encode_thumbnail(self, frame: np.ndarray) -> str:
        return self.splitter.encode_view_thumbnail(
            self.splitter._resize(frame, RTV_VIEW_SIZE)
        )

    def run_from_frame(self, frame: np.ndarray, source: str = "g1") -> dict[str, Any]:
        self.last_source = source
        views = self.split_views(frame)
        thumbs = {name: self.splitter.encode_view_thumbnail(img) for name, img in views.items()}
        return {
            "frame_b64": self.encode_thumbnail(frame),
            "split_views": thumbs,
            "views_raw": views,
            "camera_source": source,
            "width": frame.shape[1],
            "height": frame.shape[0],
        }

    def release(self) -> None:
        return
