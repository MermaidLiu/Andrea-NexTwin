"""Physical world model for rescue scenario."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from nextwin.config import RESCUE_SCENE_OBJECTS, ROBOT_WAYPOINTS_RESCUE
from nextwin.models import (
    ActionPlan,
    ObjectState,
    ObservationResult,
    RobotAction,
    SceneObject,
    TaskBlueprint,
    WorldModelState,
)


class WorldModel:
    def __init__(self) -> None:
        self.state = WorldModelState()
        self._init_idle()

    def _init_idle(self) -> None:
        self.state = WorldModelState(
            scene="idle",
            scene_label="NexTwin 无人救援",
            status="idle",
            message="等待救援指令",
            robot_position=list(ROBOT_WAYPOINTS_RESCUE["home"]),
        )

    def reset(self) -> WorldModelState:
        self._init_idle()
        return self.state

    def load_blueprint(self, blueprint: TaskBlueprint) -> WorldModelState:
        objects = [
            SceneObject(
                id=obj["id"],
                label=obj["label"],
                type=obj["type"],
                position=list(obj["position"]),
                state=ObjectState.TRAPPED if obj["id"] == "mini_pi" else ObjectState.NORMAL,
            )
            for obj in RESCUE_SCENE_OBJECTS
        ]
        self.state = WorldModelState(
            scene=blueprint.scene,
            scene_label=blueprint.scene_label,
            scenario="rescue",
            objects=objects,
            robot_position=list(ROBOT_WAYPOINTS_RESCUE["home"]),
            status="ready",
            message="救援指令已下达，等待执行",
            blueprint=blueprint,
            progress=0.0,
            phase_index=-1,
            logs=[self._log("command", f"任务: {blueprint.instruction[:40]}...")],
        )
        return self.state

    def apply_phase(self, phase: str, index: int, total: int) -> WorldModelState:
        self.state.current_phase = phase
        self.state.phase_index = index
        self.state.progress = (index + 1) / total
        self.state.status = "running"

        messages = {
            "issue_command": "救援指令已下达 ✅",
            "robot_start": "宇树机器人启动中...",
            "unitree_sensing": "G1 Livox Mid360 + RealSense D435i 采集中...",
            "split_views": "全景画面切分为前/后/左/右四个视角...",
            "yolo_detect": "YOLO 正在识别被重物压住的 Mini Pi...",
            "observation_json": "生成观察结果 JSON...",
            "rule_engine": "规则引擎正在规划救援动作...",
            "robot_execute": "宇树机器人执行救援动作...",
            "rescue_success": "Mini Pi 已成功解救！🎉",
            "display_result": "任务完成，结果已推送至大屏",
        }
        self.state.message = messages.get(phase, "执行中...")
        self._add_log(phase, self.state.message)
        return self.state

    def apply_rtv_result(self, result: dict[str, Any]) -> WorldModelState:
        obs_data = dict(result.get("observation", {}))
        if obs_data:
            if "sensor_source" in obs_data:
                obs_data["panorama_source"] = obs_data.pop("sensor_source")
            obs_data.pop("sensor_mode", None)
            obs_data.pop("lidar_stats", None)
            self.state.observation = ObservationResult(**obs_data)
        else:
            self.state.observation = None
        self.state.panorama_preview_b64 = result.get("bev_preview_b64", "")
        self.state.bev_preview_b64 = result.get("bev_preview_b64", "")
        self.state.camera_preview_b64 = result.get("camera_preview_b64", "")
        self.state.sensor_mode = result.get("sensor", {}).get("mode", "mock")
        self.state.lidar_stats = result.get("sensor", {}).get("lidar_stats", {})
        self.state.split_views = result.get("split_views", {})

        from nextwin.models import ActionPlan, RobotAction, RobotActionType
        plan_data = result.get("action_plan", {})
        if plan_data.get("actions"):
            self.state.action_plan = ActionPlan(
                rule_version=plan_data.get("rule_version", "v1.0"),
                actions=[
                    RobotAction(
                        action=RobotActionType(a["action"]),
                        label=a["label"],
                        params=a.get("params", {}),
                        reason=a.get("reason", ""),
                    )
                    for a in plan_data["actions"]
                ],
            )
        return self.state

    def apply_robot_action(self, action: RobotAction, status: str = "running") -> WorldModelState:
        self.state.current_action = action.model_copy(update={"status": status})
        action.status = status

        if action.action.value == "turn":
            deg = action.params.get("degrees", 0)
            direction = action.params.get("direction", "left")
            sign = -1 if direction == "left" else 1
            self.state.robot_heading = (self.state.robot_heading + sign * deg) % 360
            self.state.message = f"转向 {direction} {deg}°"

        elif action.action.value == "forward":
            dist = action.params.get("distance_m", 1.0)
            import math
            rad = math.radians(self.state.robot_heading)
            self.state.robot_position = [
                self.state.robot_position[0] + dist * math.sin(rad) * 0.3,
                self.state.robot_position[1],
                self.state.robot_position[2] - dist * math.cos(rad) * 0.3,
            ]
            self.state.message = f"前进 {dist}m"

        elif action.action.value == "stop":
            self.state.message = "停止 — 到达操作点"

        elif action.action.value == "push":
            self._set_object_state("heavy_debris", ObjectState.CLEARED)
            self._set_object_state("mini_pi", ObjectState.RESCUED)
            self.state.message = "推开重物 — Mini Pi 脱困中"

        self._add_log(f"action_{action.action.value}", self.state.message)
        return self.state

    def complete_rescue(self) -> WorldModelState:
        self.state.rescue_complete = True
        self.state.status = "completed"
        self.state.progress = 1.0
        self.state.message = "救援任务完成 — Mini Pi 已安全脱困 ✅"
        self._set_object_state("mini_pi", ObjectState.RESCUED)
        self._set_object_state("heavy_debris", ObjectState.CLEARED)
        self._add_log("rescue_complete", self.state.message)
        return self.state

    def interpolate_robot(self, t: float, start: list[float], end: list[float]) -> WorldModelState:
        self.state.robot_position = [start[i] + (end[i] - start[i]) * t for i in range(3)]
        return self.state

    def snapshot(self) -> WorldModelState:
        return self.state.model_copy(deep=True)

    def _set_object_state(self, obj_id: str, state: ObjectState) -> None:
        for obj in self.state.objects:
            if obj.id == obj_id:
                obj.state = state
                break

    def _add_log(self, event: str, message: str) -> None:
        self.state.logs.append(self._log(event, message))

    @staticmethod
    def _log(event: str, message: str) -> dict:
        return {
            "event": event,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
