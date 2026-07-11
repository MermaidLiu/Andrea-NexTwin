"""Physical world model — rescue + obstacle MVP scenarios."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from nextwin.config import (
    OBSTACLE_SCENE_OBJECTS,
    RESCUE_SCENE_OBJECTS,
    ROBOT_WAYPOINTS_OBSTACLE,
    ROBOT_WAYPOINTS_RESCUE,
)
from nextwin.models import (
    ActionPlan,
    ObjectState,
    ObservationResult,
    RobotAction,
    SceneObject,
    TaskBlueprint,
    WorldModelState,
)
from nextwin.physics import push_box_position


class WorldModel:
    def __init__(self) -> None:
        self.state = WorldModelState()
        self._init_idle()

    def _init_idle(self) -> None:
        self.state = WorldModelState(
            scene="idle",
            scene_label="NexTwin Studio",
            status="idle",
            message="等待任务指令",
            robot_position=list(ROBOT_WAYPOINTS_RESCUE["home"]),
        )

    def reset(self) -> WorldModelState:
        self._init_idle()
        return self.state

    @staticmethod
    def _scene_catalog(scenario: str) -> list[dict[str, Any]]:
        return OBSTACLE_SCENE_OBJECTS if scenario == "obstacle" else RESCUE_SCENE_OBJECTS

    @staticmethod
    def _waypoints(scenario: str) -> dict[str, list[float]]:
        return ROBOT_WAYPOINTS_OBSTACLE if scenario == "obstacle" else ROBOT_WAYPOINTS_RESCUE

    def load_blueprint(self, blueprint: TaskBlueprint) -> WorldModelState:
        scenario = blueprint.scenario
        catalog = self._scene_catalog(scenario)
        waypoints = self._waypoints(scenario)

        objects: list[SceneObject] = []
        for obj in catalog:
            state = ObjectState.NORMAL
            if scenario == "rescue" and obj["id"] == "mini_pi":
                state = ObjectState.TRAPPED
            if scenario == "obstacle" and obj["id"] == "obstacle_box":
                state = ObjectState.NORMAL
            objects.append(
                SceneObject(
                    id=obj["id"],
                    label=obj["label"],
                    type=obj["type"],
                    position=list(obj["position"]),
                    state=state,
                    metadata=dict(obj.get("metadata", {})),
                )
            )

        self.state = WorldModelState(
            scene=blueprint.scene,
            scene_label=blueprint.scene_label,
            scenario=scenario,
            objects=objects,
            robot_position=list(waypoints["home"]),
            status="ready",
            message="任务指令已下达，等待执行",
            blueprint=blueprint,
            progress=0.0,
            phase_index=-1,
            logs=[self._log("command", f"任务: {blueprint.instruction[:48]}")],
        )
        return self.state

    def apply_phase(self, phase: str, index: int, total: int) -> WorldModelState:
        self.state.current_phase = phase
        self.state.phase_index = index
        self.state.progress = (index + 1) / total
        self.state.status = "running"

        rescue_messages = {
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
        obstacle_messages = {
            "issue_command": "障碍物搬离任务已下达 ✅",
            "robot_start": "宇树 G1 启动中...",
            "unitree_sensing": "雷达 + 视觉扫描通道...",
            "split_views": "四向视角切分完成...",
            "yolo_detect": "YOLO 识别长方体障碍物...",
            "observation_json": "生成障碍物观察 JSON...",
            "rule_engine": "规划接近与搬离动作...",
            "robot_execute": "机器人执行搬离动作...",
            "rescue_success": "障碍物已搬离，通道畅通 ✅",
            "display_result": "MVP 演示完成",
        }
        messages = obstacle_messages if self.state.scenario == "obstacle" else rescue_messages
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

        plan_data = result.get("action_plan", {})
        if plan_data.get("actions"):
            from nextwin.models import RobotActionType

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
            self._apply_push(action)

        self._add_log(f"action_{action.action.value}", self.state.message)
        return self.state

    def _apply_push(self, action: RobotAction) -> None:
        target_id = action.params.get("target", "")
        push_dist = float(action.params.get("push_distance_m", 1.2))

        if self.state.scenario == "obstacle" or target_id == "obstacle_box":
            obj = self._get_object("obstacle_box")
            if obj:
                obj.position = push_box_position(
                    obj.position, self.state.robot_heading, push_dist
                )
                obj.state = ObjectState.CLEARED
            self.state.message = "搬离长方体障碍物 — 通道已清空"
            return

        self._set_object_state("heavy_debris", ObjectState.CLEARED)
        self._set_object_state("mini_pi", ObjectState.RESCUED)
        self.state.message = "推开重物 — Mini Pi 脱困中"

    def complete_mission(self) -> WorldModelState:
        self.state.rescue_complete = True
        self.state.status = "completed"
        self.state.progress = 1.0
        if self.state.scenario == "obstacle":
            self.state.message = "障碍物搬离 MVP 完成 — 通道畅通 ✅"
            self._set_object_state("obstacle_box", ObjectState.CLEARED)
        else:
            self.state.message = "救援任务完成 — Mini Pi 已安全脱困 ✅"
            self._set_object_state("mini_pi", ObjectState.RESCUED)
            self._set_object_state("heavy_debris", ObjectState.CLEARED)
        self._add_log("mission_complete", self.state.message)
        return self.state

    def complete_rescue(self) -> WorldModelState:
        return self.complete_mission()

    def interpolate_robot(self, t: float, start: list[float], end: list[float]) -> WorldModelState:
        self.state.robot_position = [start[i] + (end[i] - start[i]) * t for i in range(3)]
        return self.state

    def snapshot(self) -> WorldModelState:
        return self.state.model_copy(deep=True)

    def _get_object(self, obj_id: str) -> SceneObject | None:
        for obj in self.state.objects:
            if obj.id == obj_id:
                return obj
        return None

    def _set_object_state(self, obj_id: str, state: ObjectState) -> None:
        obj = self._get_object(obj_id)
        if obj:
            obj.state = state

    def _add_log(self, event: str, message: str) -> None:
        self.state.logs.append(self._log(event, message))

    @staticmethod
    def _log(event: str, message: str) -> dict:
        return {
            "event": event,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def waypoints(self) -> dict[str, list[float]]:
        return self._waypoints(self.state.scenario or "rescue")
