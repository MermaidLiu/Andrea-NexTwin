"""Earthquake obstacle-clearance workflow — Coze pipeline backend."""

from __future__ import annotations

import logging
import uuid

from nextwin.evacuation.exceptions import SafeRouteNotFoundException, WorkflowStateError
from nextwin.evacuation.models import (
    EvacuationPath,
    EvacuationWorkflowState,
    PathWaypoint,
    WorkflowOutput,
    WorkflowPhase,
)
from nextwin.obstacle_pipeline.agent import (
    MockObstacleEmbodiedAgent,
    MockObstacleSceneConfirmation,
    ObstacleEmbodiedAgent,
    ObstacleSceneConfirmation,
)
from nextwin.obstacle_pipeline.nlp import new_mission_id, parse_language_input
from nextwin.obstacle_pipeline.world_model_engine import (
    MockObstacleWorldModelEngine,
    ObstacleWorldModelEngine,
)

logger = logging.getLogger(__name__)

FALLBACK_STEPS = [
    "暂停搬离操作，重新评估箱体稳定性",
    "切换为小力距多次推移策略",
    "若结构风险升高，标记区域等待人工支援",
    "持续 LiDAR 监测余震引起的 debris 位移",
]


class ObstacleWorkflow:
    def __init__(
        self,
        scene_service: ObstacleSceneConfirmation | None = None,
        world_engine: ObstacleWorldModelEngine | None = None,
        agent: ObstacleEmbodiedAgent | None = None,
    ) -> None:
        self._scene = scene_service or MockObstacleSceneConfirmation()
        self._world = world_engine or MockObstacleWorldModelEngine()
        self._agent = agent or MockObstacleEmbodiedAgent()
        self._state: EvacuationWorkflowState | None = None

    @property
    def state(self) -> EvacuationWorkflowState | None:
        return self._state

    def _log(self, msg: str) -> None:
        logger.info(msg)
        if self._state:
            self._state.logs.append(msg)

    def start(
        self,
        instruction: str,
        session_id: str | None = None,
        world_model_id: str | None = None,
        robot_id: str | None = None,
    ) -> EvacuationWorkflowState:
        sid = session_id or uuid.uuid4().hex
        self._state = EvacuationWorkflowState(session_id=sid, phase=WorkflowPhase.LANGUAGE_INPUT)
        self._log(f"[Phase 0] 语言输入 session={sid}")

        task = parse_language_input(instruction)
        self._state.task_context = task
        self._state.phase = WorkflowPhase.SCENE_CONFIRMATION

        mission_id = new_mission_id()
        scene = self._scene.confirm_scene(task, mission_id)
        if not scene.aligned:
            raise WorkflowStateError("任务目标与障碍搬离解救不对齐")
        self._state.scene_context = scene
        self._state.phase = WorkflowPhase.PERIMETER_JUDGMENT
        self._log(f"[Phase 1] 场景确认 hazard={scene.hazard_type} aligned={scene.aligned}")

        perimeter = self._world.simulate_perimeter(task, scene)
        self._state.perimeter_map = perimeter
        self._state.phase = WorkflowPhase.TARGET_ALIGNMENT
        self._log(f"[Phase 2] 世界模型 min_risk={perimeter.min_safe_risk:.3f}")

        try:
            plan = self._agent.plan_targets(task, scene, perimeter)
            if not plan.feasible:
                raise SafeRouteNotFoundException(
                    "当前结构风险下无法安全搬离障碍物",
                    fallback_protocol="micro_push_retry",
                )
            self._state.action_plan = plan
            self._state.phase = WorkflowPhase.OUTPUT_VALIDATION
            self._log(f"[Phase 3] 决策 actions={len(plan.actions)}")

            output = self._build_output(scene, perimeter, plan)
            self._state.output = output
            self._state.phase = WorkflowPhase.AWAITING_CONFIRMATION
            self._log("[Phase 4] 等待用户确认搬离方案 (Y/N)")
            return self._state
        except SafeRouteNotFoundException as exc:
            return self._apply_fallback(exc)

    def confirm(self, approved: bool, feedback: str = "") -> EvacuationWorkflowState:
        if not self._state:
            raise WorkflowStateError("无活动会话")
        if self._state.phase not in (WorkflowPhase.AWAITING_CONFIRMATION, WorkflowPhase.SHELTER_FALLBACK):
            raise WorkflowStateError(f"当前阶段 {self._state.phase} 不可确认")

        self._state.user_confirmed = approved
        self._state.feedback = feedback or None

        if approved:
            self._state.phase = WorkflowPhase.EXECUTING
            self._log("[Gate] 用户确认 — 下发搬离指令至 G1")
            self._state.phase = WorkflowPhase.COMPLETED
            self._log("[Execute] 长方体已搬离，Mini Pi 脱困（模拟）")
            return self._state

        instruction = self._state.task_context.instruction if self._state.task_context else ""
        if feedback:
            instruction = f"{instruction}\n[反馈] {feedback}"
        return self.start(instruction, session_id=self._state.session_id)

    def _build_output(self, scene, perimeter, plan) -> WorkflowOutput:
        push = next((a for a in plan.actions if a.type == "push"), plan.actions[-1])
        path = EvacuationPath(
            waypoints=[
                PathWaypoint(x=0, y=0, z=0, label="home"),
                PathWaypoint(x=-1.2, y=0, z=-1.0, label="approach"),
                PathWaypoint(x=-1.8, y=0, z=-1.4, label="push_point"),
                PathWaypoint(x=0.5, y=0, z=0.5, label="clear_zone"),
            ],
            total_risk=perimeter.min_safe_risk,
            estimated_time_sec=38.0,
            topology="debris_nav",
        )
        rationale = (
            f"世界模型：余震概率 {perimeter.predictions.get('aftershock_prob', 0):.0%}，"
            f" debris 位移风险 {perimeter.predictions.get('debris_shift_risk', 0):.0%}；"
            f"推荐施力 {perimeter.predictions.get('recommended_push_vector')} "
            f"{perimeter.predictions.get('safe_push_force_n')}N。"
        )
        return WorkflowOutput(
            optimal_path=path,
            solution_steps=[
                f"1. YOLO 识别纸箱长方体 + 被困 Mini Pi",
                f"2. {plan.actions[1].label} — {plan.actions[1].reason}",
                f"3. {push.label} — 推力 {push.params.get('force_n')}N，距离 {push.params.get('distance_m')}m",
                "4. 二次感知确认受困机器人脱困",
            ],
            world_model_rationale=rationale,
            contingency_notes=[
                "若推力不足：切换小力距多次推移",
                "若检测到余震：暂停并重新扫描",
                "若箱体滑落：重新规划侧向施力角",
            ],
            requires_confirmation=True,
        )

    def _apply_fallback(self, exc: SafeRouteNotFoundException) -> EvacuationWorkflowState:
        self._state.fallback_protocol = exc.fallback_protocol
        self._state.phase = WorkflowPhase.SHELTER_FALLBACK
        self._state.error = str(exc)
        self._state.output = WorkflowOutput(
            optimal_path=EvacuationPath(
                waypoints=[PathWaypoint(x=-1.2, y=0, z=-1.0, label="hold_position")],
                total_risk=0.5,
                topology="hold_and_reassess",
            ),
            solution_steps=FALLBACK_STEPS,
            world_model_rationale="结构风险过高，降级为保守推移策略。",
            contingency_notes=["等待人工确认后继续"],
            requires_confirmation=True,
        )
        self._state.phase = WorkflowPhase.AWAITING_CONFIRMATION
        return self._state
