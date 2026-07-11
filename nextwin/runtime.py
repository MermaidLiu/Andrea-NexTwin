"""Lazy runtime — heavy vision stack only when installed."""

from __future__ import annotations

from typing import Any


def vision_stack_available() -> bool:
    try:
        import numpy  # noqa: F401
        return True
    except ImportError:
        return False


class Runtime:
    def __init__(self, world: Any) -> None:
        self.world = world
        self.mode = "ui"
        self.rtv = None
        self.executor = None
        self._init()

    def _init(self) -> None:
        import os

        force_ui = os.getenv("NEXTWIN_UI_ONLY", "0") == "1"
        if not force_ui and vision_stack_available():
            from nextwin.executor import RescueExecutor
            from nextwin.rtv.pipeline import RTVPipeline

            self.rtv = RTVPipeline()
            self.executor = RescueExecutor(self.world, self.rtv)
            self.mode = "full"
        else:
            from nextwin.ui_demo import UiDemoExecutor

            self.executor = UiDemoExecutor(self.world)
            self.mode = "ui"

    def release(self) -> None:
        if self.rtv:
            self.rtv.release()
        if self.executor:
            self.executor.cancel()

    @property
    def status_components(self) -> dict[str, Any]:
        if self.mode == "full" and self.rtv:
            return {
                "robot": {"status": "G1", "model": "Unitree G1"},
                "lidar": {
                    "status": self.rtv.sensor.status.get("ros2", "mock"),
                    "model": "Livox Mid360",
                    "topic": self.rtv.sensor.status.get("lidar_topic", "/utlidar/cloud"),
                },
                "vision": {
                    "status": self.rtv.sensor.status.get("ros2", "mock"),
                    "model": "RealSense D435i",
                    "topic": self.rtv.sensor.status.get("camera_topic", "/camera/color/image_raw"),
                    "source": self.rtv.last_result.get("sensor", {}).get("vision_source", ""),
                },
                "rtv": {"status": "ready", **self.rtv.status},
                "rule_engine": {"status": "ready", "version": "v1.0"},
                "g1_control": self.executor.g1.status,
                "platform_mode": "full",
            }
        return {
            "robot": {"status": "demo", "model": "UI Demo"},
            "lidar": {"status": "ui-only", "model": "—"},
            "vision": {"status": "ui-only", "model": "—"},
            "rtv": {"status": "ui-only", "detector": "mock", "sensor": "ui", "engine": "NexTwin Studio UI"},
            "rule_engine": {"status": "ready", "version": "v1.0-demo"},
            "g1_control": {"mode": "mock", "robot": "Unitree G1"},
            "platform_mode": "ui",
        }
