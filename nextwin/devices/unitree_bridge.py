"""Unitree G1 sensor bridge — Livox Mid360 + RealSense D435i."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from nextwin.config import (
    UNITREE_CAMERA_TOPIC,
    UNITREE_DEPTH_TOPIC,
    UNITREE_LIDAR_TOPIC,
    UNITREE_NETWORK_IFACE,
    UNITREE_ROBOT_MODEL,
    UNITREE_SENSOR_MODE,
    UNITREE_SENSOR_TIMEOUT,
)
from nextwin.devices.g1_config import G1_PRESET


@dataclass
class LidarFrame:
    points: np.ndarray
    timestamp: float = 0.0
    source: str = "mock"
    point_count: int = 0


@dataclass
class VisionFrame:
    image: np.ndarray
    timestamp: float = 0.0
    source: str = "mock"
    width: int = 0
    height: int = 0


@dataclass
class SensorScan:
    lidar: LidarFrame
    vision: VisionFrame
    mode: str = "mock"
    ros2_connected: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class UnitreeSensorBridge:
    """G1 sensor acquisition: Livox Mid360 (ROS2) + D435i (ROS2 or SDK2)."""

    def __init__(self) -> None:
        self.robot_model = UNITREE_ROBOT_MODEL
        self.mode = UNITREE_SENSOR_MODE
        self._ros2 = None
        self._sdk_camera = None
        self._last_error = ""
        self._init_backend()

    def _init_backend(self) -> None:
        if self.mode in ("ros2", "sdk"):
            if self.mode == "ros2" or self.robot_model == "g1":
                try:
                    from nextwin.devices.ros2_bridge import UnitreeROS2Bridge
                    self._ros2 = UnitreeROS2Bridge(
                        lidar_topic=UNITREE_LIDAR_TOPIC,
                        camera_topic=UNITREE_CAMERA_TOPIC,
                        depth_topic=UNITREE_DEPTH_TOPIC,
                        timeout=UNITREE_SENSOR_TIMEOUT,
                        robot_model=self.robot_model,
                    )
                    if self._ros2.connect():
                        self.mode = "ros2"
                except Exception as exc:
                    self._last_error = str(exc)
                    self._ros2 = None

            if self.mode == "sdk":
                try:
                    from nextwin.devices.g1_sdk_bridge import G1SDKCameraBridge
                    self._sdk_camera = G1SDKCameraBridge(UNITREE_NETWORK_IFACE)
                    if self._sdk_camera.is_available:
                        self.mode = "sdk"
                        return
                except Exception as exc:
                    self._last_error = str(exc)

            if self._ros2 and self._ros2.is_connected:
                self.mode = "ros2"
            else:
                self.mode = "mock"

    @property
    def status(self) -> dict[str, str]:
        return {
            "robot_model": self.robot_model,
            "mode": self.mode,
            "lidar": G1_PRESET["lidar_model"],
            "camera": G1_PRESET["camera_model"],
            "lidar_topic": UNITREE_LIDAR_TOPIC,
            "camera_topic": UNITREE_CAMERA_TOPIC,
            "depth_topic": UNITREE_DEPTH_TOPIC,
            "backend": "G1 Livox Mid360 + RealSense D435i",
            "ros2": "connected" if self._ros2 and self._ros2.is_connected else "disconnected",
            "sdk_camera": "ready" if self._sdk_camera and self._sdk_camera.is_available else "off",
            "error": self._last_error,
        }

    def scan(self) -> SensorScan:
        if self.mode == "ros2" and self._ros2:
            scan = self._ros2.grab_scan()
            if scan:
                return scan

        if self.mode == "sdk" and self._sdk_camera:
            frame = self._sdk_camera.grab_with_retry()
            if frame is not None:
                from nextwin.devices.mock_sensor import MockUnitreeSensor
                mock = MockUnitreeSensor.generate_scan()
                mock.vision = VisionFrame(
                    image=frame,
                    timestamp=time.time(),
                    source=f"sdk2:{UNITREE_NETWORK_IFACE}",
                    width=frame.shape[1],
                    height=frame.shape[0],
                )
                mock.mode = "sdk"
                mock.metadata["note"] = "LiDAR=mock, Camera=SDK2 真机"
                return mock

        from nextwin.devices.mock_sensor import MockUnitreeSensor
        return MockUnitreeSensor.generate_scan()

    def scan_with_retry(self, retries: int = 3) -> SensorScan:
        for _ in range(retries):
            scan = self.scan()
            if scan.lidar.point_count > 0:
                return scan
            time.sleep(0.3)
        return scan
