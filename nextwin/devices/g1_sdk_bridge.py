"""G1 direct SDK2 camera bridge (unitree_sdk2_python, no ROS2 required for camera)."""

from __future__ import annotations

import os
import time
from typing import Any

import numpy as np


class G1SDKCameraBridge:
    """Grab front camera frame via unitree_sdk2_python VideoClient."""

    def __init__(self, network_iface: str | None = None) -> None:
        self.network_iface = network_iface or os.getenv("UNITREE_NETWORK_IFACE", "eth0")
        self._client: Any = None
        self._available = False
        self._init()

    def _init(self) -> None:
        try:
            from unitree_sdk2py.core.channel import ChannelFactoryInitialize
            from unitree_sdk2py.go2.video.video_client import VideoClient  # G1 may use same or hg module

            ChannelFactoryInitialize(0, self.network_iface)
            self._client = VideoClient()
            self._client.SetTimeout(3.0)
            self._client.Init()
            self._available = True
        except Exception:
            try:
                # Fallback import path
                from unitree_sdk2py.core.channel import ChannelFactoryInitialize
                ChannelFactoryInitialize(0, self.network_iface)
                self._available = False
            except Exception:
                self._available = False

    @property
    def is_available(self) -> bool:
        return self._available

    def grab_frame(self) -> np.ndarray | None:
        if not self._available or not self._client:
            return None
        try:
            import cv2
            code, data = self._client.GetImageSample()
            if code != 0 or not data:
                return None
            arr = np.frombuffer(bytes(data), dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                return None
            return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        except Exception:
            return None

    def grab_with_retry(self, retries: int = 3) -> np.ndarray | None:
        for _ in range(retries):
            frame = self.grab_frame()
            if frame is not None:
                return frame
            time.sleep(0.2)
        return None
