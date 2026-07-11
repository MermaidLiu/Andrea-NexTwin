"""Unitree G1 sensor bridge — Livox Mid360 + RealSense D435i via ROS2 / SDK2."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from nextwin.config import (
    UNITREE_CAMERA_TOPIC,
    UNITREE_DEPTH_TOPIC,
    UNITREE_LIDAR_MODE,
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
    """G1 onboard sensors: Livox Mid360 + RealSense D435i.

    Modes:
      ros2 — subscribe /utlidar/cloud + /camera/color/image_raw (default)
      sdk  — unitree_sdk2_python camera + mock LiDAR
      mock — synthetic demo data (no robot)
    """

    def __init__(self) -> None:
        self.robot_model = UNITREE_ROBOT_MODEL
        self.mode = UNITREE_SENSOR_MODE
        self._ros2 = None
        self._sdk_camera = None
        self._last_error = ""
        self._init_backend()

    def _init_backend(self) -> None:
        requested = self.mode

        if requested == "mock":
            self.mode = "mock"
            return

        if requested in ("ros2", "sdk") or self.robot_model == "g1":
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
                    return
            except Exception as exc:
                self._last_error = f"ROS2: {exc}"
                self._ros2 = None

        if requested == "sdk":
            try:
                from nextwin.devices.g1_sdk_bridge import G1SDKCameraBridge

                self._sdk_camera = G1SDKCameraBridge(UNITREE_NETWORK_IFACE)
                if self._sdk_camera.is_available:
                    self.mode = "sdk"
                    return
            except Exception as exc:
                self._last_error = f"SDK2: {exc}"

        if requested != "mock":
            self._last_error = (
                self._last_error
                or "G1 ROS2 未连接。请先 source ~/unitree_ros2/setup.sh"
            )
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

    def grab_camera_frame(self) -> VisionFrame | None:
        """G1 RealSense frame only (for live preview)."""
        if self.mode == "ros2" and self._ros2:
            return self._ros2.grab_camera()
        if self.mode == "sdk" and self._sdk_camera:
            frame = self._sdk_camera.grab_with_retry()
            if frame is not None:
                return VisionFrame(
                    image=frame,
                    timestamp=time.time(),
                    source=f"g1_sdk2:{UNITREE_NETWORK_IFACE}",
                    width=frame.shape[1],
                    height=frame.shape[0],
                )
        return None

    def scan(self) -> SensorScan:
        if self.mode == "ros2" and self._ros2:
            scan = self._ros2.grab_scan()
            if scan:
                return scan
            self._last_error = "ROS2 未收到 G1 传感器数据"

        if self.mode == "sdk" and self._sdk_camera:
            frame = self._sdk_camera.grab_with_retry()
            if frame is not None:
                from nextwin.devices.mock_sensor import MockUnitreeSensor

                mock = MockUnitreeSensor.generate_scan()
                mock.vision = VisionFrame(
                    image=frame,
                    timestamp=time.time(),
                    source=f"g1_sdk2:{UNITREE_NETWORK_IFACE}",
                    width=frame.shape[1],
                    height=frame.shape[0],
                )
                mock.mode = "sdk"
                mock.metadata["note"] = "LiDAR=mock, Camera=G1 SDK2 真机"
                return mock

        from nextwin.devices.mock_sensor import MockUnitreeSensor

        scan = MockUnitreeSensor.generate_scan()
        scan.metadata["note"] = (
            "模拟数据。真机请: source ~/unitree_ros2/setup.sh && "
            "export UNITREE_SENSOR_MODE=ros2"
        )
        if self._last_error:
            scan.metadata["error"] = self._last_error
        return scan

    def release(self) -> None:
        if self._ros2:
            self._ros2.shutdown()

    def scan_with_retry(self, retries: int = 3) -> SensorScan:
        for _ in range(retries):
            scan = self.scan()
            if scan.lidar.point_count > 0 and scan.vision.width > 0:
                return scan
            time.sleep(0.3)
        return scan
