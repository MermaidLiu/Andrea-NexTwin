"""Rescue execution pipeline — 10-step embodied rescue flow."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from nextwin.devices.g1_control import G1Controller
from nextwin.models import RescuePhase, RobotActionType, TaskBlueprint, WorldModelState
from nextwin.rtv.pipeline import RTVPipeline
from nextwin.world_model import WorldModel

BroadcastFn = Callable[[dict[str, Any]], Awaitable[None]]


class RescueExecutor:
    def __init__(self, world: WorldModel, rtv: RTVPipeline | None = None) -> None:
        self.world = world
        self.rtv = rtv or RTVPipeline()
        self.g1 = G1Controller()
        self._running = False
        self._cancel = False
        self._rtv_result: dict[str, Any] = {}

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
        total = len(steps)

        try:
            for index, step in enumerate(steps):
                if self._cancel:
                    self.world.state.status = "cancelled"
                    self.world.state.message = "救援任务已取消"
                    break
                await self._run_phase(step.phase, index, total, broadcast)

            if self.world.state.status == "running":
                self.world.complete_mission()
                await broadcast({"type": "rescue_complete", "state": self.world.snapshot().model_dump()})
        finally:
            self._running = False
            await broadcast({"type": "execution_end", "state": self.world.snapshot().model_dump()})

        return self.world.snapshot()

    async def _run_phase(self, phase: str, index: int, total: int, broadcast: BroadcastFn) -> None:
        self.world.apply_phase(phase, index, total)
        await broadcast({"type": "phase_start", "phase": phase, "state": self.world.snapshot().model_dump()})

        duration = self.world.state.blueprint.steps[index].duration_sec if self.world.state.blueprint else 2.0

        if phase == RescuePhase.ISSUE_COMMAND.value:
            await self._sleep(duration, phase, broadcast)

        elif phase == RescuePhase.ROBOT_START.value:
            self.world.state.message = "Unitree 系统自检通过 — 电机/IMU/通信 OK"
            await self._sleep(duration, phase, broadcast)

        elif phase == RescuePhase.UNITREE_SENSING.value:
            await self._sleep(duration * 0.3, phase, broadcast, {"overlay": "G1 Livox + D435i 采集中..."})
            self._rtv_result = self.rtv.run_full_analysis(
                scenario=self.world.state.scenario or "rescue"
            )
            self.world.apply_rtv_result(self._rtv_result)
            await broadcast({
                "type": "sensor_ready",
                "bev_b64": self._rtv_result.get("bev_preview_b64", ""),
                "camera_b64": self._rtv_result.get("camera_preview_b64", ""),
                "sensor": self._rtv_result.get("sensor", {}),
                "state": self.world.snapshot().model_dump(),
            })
            await self._sleep(duration * 0.3, phase, broadcast)

        elif phase == RescuePhase.SPLIT_VIEWS.value:
            await broadcast({
                "type": "split_views",
                "views": self._rtv_result.get("split_views", {}),
                "state": self.world.snapshot().model_dump(),
            })
            await self._sleep(duration, phase, broadcast)

        elif phase == RescuePhase.YOLO_DETECT.value:
            await broadcast({
                "type": "yolo_detections",
                "views": self._rtv_result.get("views_detections", {}),
                "target_view": self._rtv_result.get("target_view", "front"),
                "summary": self._rtv_result.get("summary", ""),
                "state": self.world.snapshot().model_dump(),
            })
            await self._sleep(duration, phase, broadcast)

        elif phase == RescuePhase.OBSERVATION_JSON.value:
            await broadcast({
                "type": "observation_json",
                "observation": self._rtv_result.get("observation", {}),
                "state": self.world.snapshot().model_dump(),
            })
            await self._sleep(duration, phase, broadcast)

        elif phase == RescuePhase.RULE_ENGINE.value:
            await broadcast({
                "type": "action_plan",
                "action_plan": self._rtv_result.get("action_plan", {}),
                "state": self.world.snapshot().model_dump(),
            })
            await self._sleep(duration, phase, broadcast)

        elif phase == RescuePhase.ROBOT_EXECUTE.value:
            await self._execute_actions(broadcast, duration)

        elif phase == RescuePhase.RESCUE_SUCCESS.value:
            self.world.complete_mission()
            await broadcast({"type": "rescue_success", "state": self.world.snapshot().model_dump()})
            await self._sleep(duration, phase, broadcast)

        elif phase == RescuePhase.DISPLAY_RESULT.value:
            target = (
                "obstacle_box"
                if self.world.state.scenario == "obstacle"
                else "mini_pi"
            )
            msg = (
                "长方体障碍物已搬离，通道畅通"
                if self.world.state.scenario == "obstacle"
                else "Mini Pi 已成功解救"
            )
            await broadcast({
                "type": "display_result",
                "result": {
                    "status": "success",
                    "target": target,
                    "message": msg,
                    "observation": self._rtv_result.get("observation"),
                    "actions_executed": self._rtv_result.get("action_plan"),
                },
                "state": self.world.snapshot().model_dump(),
            })
            await self._sleep(duration, phase, broadcast)

        else:
            await self._sleep(duration, phase, broadcast)

        await broadcast({"type": "phase_end", "phase": phase, "state": self.world.snapshot().model_dump()})

    async def _execute_actions(self, broadcast: BroadcastFn, duration: float) -> None:
        plan = self.world.state.action_plan
        if not plan or not plan.actions:
            await self._sleep(duration, RescuePhase.ROBOT_EXECUTE.value, broadcast)
            return

        per_action = duration / len(plan.actions)
        waypoints = self.world.waypoints()
        push_point = waypoints.get("push_point", waypoints["home"])

        for i, action in enumerate(plan.actions):
            if self._cancel:
                return

            self.world.apply_robot_action(action, status="running")
            g1_result = self.g1.execute(action)
            await broadcast({
                "type": "robot_action",
                "action": {
                    "action": action.action.value,
                    "label": action.label,
                    "params": action.params,
                    "reason": action.reason,
                    "status": "running",
                    "g1": g1_result,
                },
                "state": self.world.snapshot().model_dump(),
            })

            if action.action == RobotActionType.TURN:
                await self._sleep(per_action * 0.4, RescuePhase.ROBOT_EXECUTE.value, broadcast)
            elif action.action == RobotActionType.FORWARD:
                await self._animate_robot(
                    list(waypoints["home"]),
                    list(push_point),
                    per_action * 0.6,
                    broadcast,
                )
            elif action.action == RobotActionType.STOP:
                await self._sleep(per_action * 0.3, RescuePhase.ROBOT_EXECUTE.value, broadcast)
            elif action.action == RobotActionType.PUSH:
                self.world.apply_robot_action(action, status="done")
                await self._sleep(per_action * 0.5, RescuePhase.ROBOT_EXECUTE.value, broadcast)

            action.status = "done"
            self.world.apply_robot_action(action, status="done")
            await broadcast({
                "type": "robot_action",
                "action": {
                    "action": action.action.value,
                    "label": action.label,
                    "status": "done",
                },
                "state": self.world.snapshot().model_dump(),
            })

    async def _animate_robot(
        self, start: list[float], end: list[float], duration: float, broadcast: BroadcastFn
    ) -> None:
        steps = max(int(duration / 0.1), 8)
        for i in range(steps + 1):
            if self._cancel:
                return
            t = i / steps
            t = t * t * (3 - 2 * t)
            self.world.interpolate_robot(t, start, end)
            await broadcast({"type": "robot_move", "t": t, "state": self.world.snapshot().model_dump()})
            await asyncio.sleep(duration / steps)

    async def _sleep(
        self, duration: float, phase: str, broadcast: BroadcastFn, extra: dict | None = None
    ) -> None:
        ticks = max(int(duration / 0.4), 1)
        for i in range(ticks):
            if self._cancel:
                return
            payload: dict[str, Any] = {
                "type": "tick",
                "phase": phase,
                "tick": i + 1,
                "total_ticks": ticks,
                "state": self.world.snapshot().model_dump(),
            }
            if extra:
                payload.update(extra)
            await broadcast(payload)
            await asyncio.sleep(duration / ticks)
