"""UI-only demo executor — no numpy / OpenCV / YOLO required."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from nextwin.config import ROBOT_WAYPOINTS_RESCUE
from nextwin.devices.g1_control import G1Controller
from nextwin.models import RescuePhase, RobotActionType, TaskBlueprint, WorldModelState
from nextwin.world_model import WorldModel

BroadcastFn = Callable[[dict[str, Any]], Awaitable[None]]

MOCK_RTV_RESULT: dict[str, Any] = {
    "sensor": {"mode": "ui-demo", "point_count": 8000, "lidar_stats": {"point_count": 8000}},
    "bev_preview_b64": "",
    "camera_preview_b64": "",
    "split_views": {},
    "views_detections": {
        "front": [
            {
                "class": "mini_pi",
                "label": "Mini Pi (被压)",
                "confidence": 0.88,
                "bbox": [200, 250, 440, 520],
                "view": "front",
            }
        ]
    },
    "target_view": "front",
    "summary": "[UI Demo] 前方识别到 Mini Pi 被重物压住",
    "observation": {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "panorama_source": "ui_demo",
        "views": {"front": []},
        "target": {
            "class": "mini_pi",
            "label": "Mini Pi (被压)",
            "confidence": 0.88,
            "view": "front",
        },
        "scene_assessment": "mini_pi_trapped_under_debris",
        "detector_mode": "ui-demo",
    },
    "action_plan": {
        "rule_version": "v1.0-demo",
        "actions": [
            {"action": "turn", "label": "转向坍塌区域", "params": {"degrees": -45, "direction": "left"}, "reason": "对准 Mini Pi"},
            {"action": "forward", "label": "前进接近", "params": {"distance_m": 1.5}, "reason": "靠近目标"},
            {"action": "stop", "label": "停止", "params": {}, "reason": "到达推重物位置"},
            {"action": "push", "label": "推开重物", "params": {"target": "heavy_debris"}, "reason": "解救 Mini Pi"},
        ],
    },
}


class UiDemoExecutor:
    """Runs the 10-step rescue flow for UI preview without vision libraries."""

    def __init__(self, world: WorldModel) -> None:
        self.world = world
        self.g1 = G1Controller()
        self._running = False
        self._cancel = False
        self._rtv_result = MOCK_RTV_RESULT

    @property
    def is_running(self) -> bool:
        return self._running

    def cancel(self) -> None:
        self._cancel = True

    async def run(self, blueprint: TaskBlueprint, broadcast: BroadcastFn) -> WorldModelState:
        if self._running:
            raise RuntimeError("Rescue already running")

        self._running = True
        self._cancel = False
        self.world.load_blueprint(blueprint)
        await broadcast({"type": "execution_start", "state": self.world.snapshot().model_dump()})

        steps = blueprint.steps
        try:
            for index, step in enumerate(steps):
                if self._cancel:
                    self.world.state.status = "cancelled"
                    self.world.state.message = "救援任务已取消"
                    break
                await self._run_phase(step.phase, index, len(steps), broadcast)
            if self.world.state.status == "running":
                self.world.complete_rescue()
                await broadcast({"type": "rescue_complete", "state": self.world.snapshot().model_dump()})
        finally:
            self._running = False
            await broadcast({"type": "execution_end", "state": self.world.snapshot().model_dump()})
        return self.world.snapshot()

    async def _run_phase(self, phase: str, index: int, total: int, broadcast: BroadcastFn) -> None:
        self.world.apply_phase(phase, index, total)
        await broadcast({"type": "phase_start", "phase": phase, "state": self.world.snapshot().model_dump()})
        duration = self.world.state.blueprint.steps[index].duration_sec if self.world.state.blueprint else 2.0

        if phase == RescuePhase.UNITREE_SENSING.value:
            self.world.apply_rtv_result(self._rtv_result)
            await broadcast({
                "type": "sensor_ready",
                "sensor": self._rtv_result.get("sensor", {}),
                "state": self.world.snapshot().model_dump(),
            })
        elif phase == RescuePhase.SPLIT_VIEWS.value:
            await broadcast({"type": "split_views", "views": {}, "state": self.world.snapshot().model_dump()})
        elif phase == RescuePhase.YOLO_DETECT.value:
            await broadcast({
                "type": "yolo_detections",
                "views": self._rtv_result.get("views_detections", {}),
                "target_view": "front",
                "summary": self._rtv_result.get("summary", ""),
                "state": self.world.snapshot().model_dump(),
            })
        elif phase == RescuePhase.OBSERVATION_JSON.value:
            await broadcast({
                "type": "observation_json",
                "observation": self._rtv_result.get("observation", {}),
                "state": self.world.snapshot().model_dump(),
            })
        elif phase == RescuePhase.RULE_ENGINE.value:
            await broadcast({
                "type": "action_plan",
                "action_plan": self._rtv_result.get("action_plan", {}),
                "state": self.world.snapshot().model_dump(),
            })
        elif phase == RescuePhase.ROBOT_EXECUTE.value:
            await self._execute_actions(broadcast, duration)
        elif phase == RescuePhase.RESCUE_SUCCESS.value:
            self.world.complete_rescue()
            await broadcast({"type": "rescue_success", "state": self.world.snapshot().model_dump()})
        elif phase == RescuePhase.DISPLAY_RESULT.value:
            await broadcast({
                "type": "display_result",
                "result": {"status": "success", "message": "Mini Pi 已成功解救 (UI Demo)"},
                "state": self.world.snapshot().model_dump(),
            })

        await asyncio.sleep(min(duration, 1.5))
        await broadcast({"type": "phase_end", "phase": phase, "state": self.world.snapshot().model_dump()})

    async def _execute_actions(self, broadcast: BroadcastFn, duration: float) -> None:
        plan = self.world.state.action_plan
        if not plan or not plan.actions:
            return
        per_action = duration / len(plan.actions)
        waypoints = ROBOT_WAYPOINTS_RESCUE
        for action in plan.actions:
            if self._cancel:
                return
            self.world.apply_robot_action(action, status="running")
            g1_result = self.g1.execute(action)
            await broadcast({
                "type": "robot_action",
                "action": {"action": action.action.value, "label": action.label, "status": "running", "g1": g1_result},
                "state": self.world.snapshot().model_dump(),
            })
            if action.action == RobotActionType.FORWARD:
                await self._animate_robot(list(waypoints["home"]), list(waypoints["push_point"]), per_action * 0.6, broadcast)
            else:
                await asyncio.sleep(per_action * 0.4)
            action.status = "done"
            self.world.apply_robot_action(action, status="done")
            await broadcast({
                "type": "robot_action",
                "action": {"action": action.action.value, "label": action.label, "status": "done"},
                "state": self.world.snapshot().model_dump(),
            })

    async def _animate_robot(
        self, start: list[float], end: list[float], duration: float, broadcast: BroadcastFn
    ) -> None:
        steps = max(int(duration / 0.1), 5)
        for i in range(steps + 1):
            if self._cancel:
                return
            t = i / steps
            self.world.interpolate_robot(t * t * (3 - 2 * t), start, end)
            await broadcast({"type": "robot_move", "state": self.world.snapshot().model_dump()})
            await asyncio.sleep(duration / steps)
