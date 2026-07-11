"""G1 locomotion control hooks (unitree_ros2 / SDK2)."""

from __future__ import annotations

import os
from typing import Any

from nextwin.models import RobotAction, RobotActionType


class G1Controller:
    """Execute rescue actions on Unitree G1.

    Modes:
      mock  - log only (default)
      ros2  - publish to G1 low-level / sport topics (requires unitree_ros2)
    """

    def __init__(self) -> None:
        self.mode = os.getenv("UNITREE_CONTROL_MODE", "mock")
        self._ros2_pub = None

    @property
    def status(self) -> dict[str, str]:
        return {"mode": self.mode, "robot": "Unitree G1", "control": "lowlevel/sport"}

    def execute(self, action: RobotAction) -> dict[str, Any]:
        if self.mode == "ros2":
            return self._execute_ros2(action)
        return self._execute_mock(action)

    def _execute_mock(self, action: RobotAction) -> dict[str, Any]:
        labels = {
            RobotActionType.TURN: f"G1 转向 {action.params.get('degrees', 0)}°",
            RobotActionType.FORWARD: f"G1 前进 {action.params.get('distance_m', 0)}m",
            RobotActionType.STOP: "G1 停止",
            RobotActionType.PUSH: f"G1 推重物 {action.params.get('target', '')}",
        }
        return {"status": "ok", "mode": "mock", "message": labels.get(action.action, "G1 动作")}

    def _execute_ros2(self, action: RobotAction) -> dict[str, Any]:
        # Placeholder for G1 sport/lowlevel integration via unitree_ros2
        # See: unitree_ros2/example/g1/lowlevel/g1_low_level_example
        return {
            "status": "ok",
            "mode": "ros2",
            "message": f"G1 ROS2 command queued: {action.action.value}",
            "note": "接入 unitree_ros2 G1 lowlevel 示例后可发真机指令",
        }
