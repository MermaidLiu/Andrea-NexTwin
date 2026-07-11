"""Evacuation workflow state machine — suspendable 5-phase pipeline."""

from __future__ import annotations

import logging
import uuid

from nextwin.evacuation.agent import (
    EmbodiedAgent,
    MockEmbodiedAgent,
    MockSceneConfirmationService,
    SceneConfirmationService,
)
from nextwin.evacuation.exceptions import SafeRouteNotFoundException, WorkflowStateError
from nextwin.evacuation.models import (
    EvacuationPath,
    EvacuationWorkflowState,
    PathWaypoint,
    WorkflowOutput,
    WorkflowPhase,
)
from nextwin.evacuation.nlp import new_mission_id, parse_language_input
from nextwin.evacuation.world_model_engine import MockWorldModelEngine, WorldModelEngine

logger = logging.getLogger(__name__)

SHELTER_FALLBACK_STEPS = [
    "停止向出口移动，评估当前位置结构稳定性",
    "关闭通风口，用湿布封堵门缝减缓烟雾侵入",
    "机器人启用隔热护盾，建立 2m 安全缓冲区",
    "向指挥中心报告精确坐标，等待外部救援",
    "持续监测环境风险，仅在出现更好掩体时短距转移",
]


class EvacuationWorkflow:
    """State-pattern workflow with suspend at phase 4 awaiting user Y/N."""

    def __init__(
        self,
        scene_service: SceneConfirmationService | None = None,
        world_engine: WorldModelEngine | None = None,
        agent: EmbodiedAgent | None = None,
        force_unsafe: bool = False,
    ) -> None:
        self._scene = scene_service or MockSceneConfirmationService()
        self._world = world_engine or MockWorldModelEngine()
        self._agent = agent or MockEmbodiedAgent()
        self._force_unsafe = force_unsafe
        self._state: EvacuationWorkflowState | None = None

    @property
    def state(self) -> EvacuationWorkflowState | None:
        return self._state

    def _log(self, msg: str) -> None:
        logger.info(msg)
        if self._state is not None:
            self._state.logs.append(msg)

    def start(
        self,
        instruction: str,
        session_id: str | None = None,
        world_model_id: str | None = None,
        robot_id: str | None = None,
    ) -> EvacuationWorkflowState:
        """Run phases 0→4 and suspend at AWAITING_CONFIRMATION."""
        sid = session_id or uuid.uuid4().hex
        self._state = EvacuationWorkflowState(session_id=sid, phase=WorkflowPhase.LANGUAGE_INPUT)
        self._log(f"[Phase 0] 语言输入 session={sid}")

        task = parse_language_input(instruction)
        self._state.task_context = task
        self._state.phase = WorkflowPhase.SCENE_CONFIRMATION

        mission_id = new_mission_id()
        scene = self._scene.confirm_scene(task, mission_id)
        if not scene.aligned:
            raise WorkflowStateError("任务目标与安全逃生不对齐，无法继续")
        self._state.scene_context = scene
        self._state.phase = WorkflowPhase.PERIMETER_JUDGMENT
        self._log(f"[Phase 1] 场景确认 aligned={scene.aligned} hazard={scene.hazard_type}")

        perimeter = self._world.simulate_perimeter(task, scene)
        self._state.perimeter_map = perimeter
        self._state.phase = WorkflowPhase.TARGET_ALIGNMENT
        self._log(
            f"[Phase 2] 周界判断 grid={perimeter.grid_width}x{perimeter.grid_height} "
            f"no_go={sum(1 for c in perimeter.risk_grid if c.is_no_go)}"
        )

        try:
            plan = self._agent.plan_targets(task, scene, perimeter)
            if self._force_unsafe or not plan.feasible or perimeter.min_safe_risk >= 0.85:
                raise SafeRouteNotFoundException(
                    "世界模型与具身智能体无法推演安全逃生路径",
                    fallback_protocol="shelter_in_place",
                )
            self._state.action_plan = plan
            self._state.phase = WorkflowPhase.OUTPUT_VALIDATION
            self._log(f"[Phase 3] 目标确认 actions={len(plan.actions)} feasible={plan.feasible}")

            output = self._build_output(task, scene, perimeter, plan)
            self._state.output = output
            self._state.phase = WorkflowPhase.AWAITING_CONFIRMATION
            self._log("[Phase 4] 输出就绪，等待用户确认 (Y/N)")
            return self._state

        except SafeRouteNotFoundException as exc:
            return self._apply_shelter_fallback(exc)

    def confirm(self, approved: bool, feedback: str = "") -> EvacuationWorkflowState:
        """Handle user gate at phase 4. N → restart from phase 1 with feedback."""
        if self._state is None:
            raise WorkflowStateError("无活动会话，请先调用 start()")
        if self._state.phase not in (
            WorkflowPhase.AWAITING_CONFIRMATION,
            WorkflowPhase.SHELTER_FALLBACK,
        ):
            raise WorkflowStateError(f"当前阶段 {self._state.phase} 不可确认")

        self._state.user_confirmed = approved
        self._state.feedback = feedback or None

        if approved:
            self._state.phase = WorkflowPhase.EXECUTING
            self._log("[Gate] 用户确认 Y — 进入物理执行阶段")
            self._state.phase = WorkflowPhase.COMPLETED
            self._log("[Execute] 逃生路径执行完成（模拟）")
            return self._state

        self._log(f"[Gate] 用户拒绝 N — 反馈: {feedback or '无'}，重新从阶段 1 推演")
        instruction = self._state.task_context.instruction if self._state.task_context else ""
        if feedback:
            instruction = f"{instruction}\n[用户反馈] {feedback}"
        return self.start(instruction, session_id=self._state.session_id)

    def _build_output(self, task, scene, perimeter, plan) -> WorkflowOutput:
        path = self._compute_optimal_path(perimeter)
        steps = [
            f"1. {plan.actions[0].label} — {plan.actions[0].reason}" if plan.actions else "1. 定位安全出口",
            "2. 沿风险系数最低网格路径移动，避开禁行区",
            "3. 启用机器人护盾保护受困人员",
            "4. 抵达集结点 assembly_point_A 并上报状态",
        ]
        rationale = (
            f"世界模型预测：{scene.hazard_type} 蔓延速率 "
            f"{perimeter.predictions.get('fire_spread_rate_m_per_min', 0)} m/min，"
            f"烟雾扩散方向 {perimeter.predictions.get('smoke_diffusion', 'unknown')}；"
            f"最小安全风险系数 {perimeter.min_safe_risk:.2f}。"
        )
        contingencies = [
            "若路径被新障碍阻断：重新调用周界判断（阶段 2）",
            "若电量低于 20%：切换至最近掩体避险协议",
            "若受困人员无法移动：机器人原地建立防护圈等待救援",
        ]
        return WorkflowOutput(
            optimal_path=path,
            solution_steps=steps,
            world_model_rationale=rationale,
            contingency_notes=contingencies,
            requires_confirmation=True,
        )

    def _compute_optimal_path(self, perimeter) -> EvacuationPath:
        safe = sorted(
            [c for c in perimeter.risk_grid if not c.is_no_go and c.risk < 0.4],
            key=lambda c: c.risk,
        )
        if not safe:
            safe = sorted(perimeter.risk_grid, key=lambda c: c.risk)[:5]

        waypoints = [
            PathWaypoint(x=float(c.x), y=0.0, z=float(c.y), label=f"wp_{i}")
            for i, c in enumerate(safe[:6])
        ]
        if waypoints:
            waypoints[-1].label = "exit_B"

        total_risk = sum(w.risk for w in safe[: len(waypoints)]) / max(len(waypoints), 1)
        return EvacuationPath(
            waypoints=waypoints,
            total_risk=round(total_risk, 3),
            estimated_time_sec=len(waypoints) * 15.0,
            topology="grid_astar",
        )

    def _apply_shelter_fallback(self, exc: SafeRouteNotFoundException) -> EvacuationWorkflowState:
        self._state.fallback_protocol = exc.fallback_protocol
        self._state.phase = WorkflowPhase.SHELTER_FALLBACK
        self._state.error = str(exc)
        self._log(f"[Fallback] {exc.fallback_protocol}: {exc}")

        path = EvacuationPath(
            waypoints=[PathWaypoint(x=3.0, y=0.0, z=3.0, label="current_shelter")],
            total_risk=0.35,
            estimated_time_sec=0.0,
            topology="shelter_in_place",
        )
        self._state.output = WorkflowOutput(
            optimal_path=path,
            solution_steps=SHELTER_FALLBACK_STEPS,
            world_model_rationale="无法推演安全逃生路径，降级至就地掩体避险协议。",
            contingency_notes=["等待外部救援", "持续环境监测"],
            requires_confirmation=True,
        )
        self._state.phase = WorkflowPhase.AWAITING_CONFIRMATION
        self._log("[Phase 4] 备用协议输出就绪，等待用户确认 (Y/N)")
        return self._state

    def to_dict(self) -> dict:
        if self._state is None:
            return {}
        return self._state.model_dump(mode="json")
