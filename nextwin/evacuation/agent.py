"""Phase 1 & 3 — scene confirmation and embodied agent (ABC + mock)."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from nextwin.evacuation.models import (
    ActionPrimitive,
    PerimeterMap,
    SceneContext,
    TargetActionPlan,
    TaskContext,
)

logger = logging.getLogger(__name__)


class SceneConfirmationService(ABC):
    @abstractmethod
    def confirm_scene(self, task: TaskContext, mission_id: str) -> SceneContext:
        ...


class EmbodiedAgent(ABC):
    @abstractmethod
    def plan_targets(
        self, task: TaskContext, scene: SceneContext, perimeter: PerimeterMap
    ) -> TargetActionPlan:
        ...


class MockSceneConfirmationService(SceneConfirmationService):
    """Validate mission aligns with safe evacuation and init environment state."""

    def confirm_scene(self, task: TaskContext, mission_id: str) -> SceneContext:
        aligned = task.mission_goal == "safe_evacuation" or any(
            e.entity_type == "intent" and e.value == "safe_evacuation" for e in task.entities
        )
        hazard = task.hazard_types[0] if task.hazard_types else "fire"
        risk = 0.75 if task.urgency == "critical" else 0.55

        ctx = SceneContext(
            mission_id=mission_id,
            ultimate_goal="safe_evacuation",
            aligned=aligned,
            building_layout="apartment_kitchen_hall_exit",
            hazard_type=hazard,
            initial_risk_level=risk,
            evacuation_zones=["kitchen", "hallway", "stairwell", "exit_B"],
            muster_points=["exit_B", "assembly_point_A"],
            rationale=(
                f"任务目标与「安全逃生」对齐={aligned}；"
                f"灾害类型={hazard}，初始风险={risk:.0%}，"
                f"优先路径：{' → '.join(['kitchen', 'hallway', 'exit_B'])}"
            ),
        )
        logger.info("[MockSceneConfirm] %s", ctx.rationale)
        return ctx


class MockEmbodiedAgent(EmbodiedAgent):
    """G1 embodied agent — sub-goals and action primitives under physical constraints."""

    def plan_targets(
        self, task: TaskContext, scene: SceneContext, perimeter: PerimeterMap
    ) -> TargetActionPlan:
        logger.info("[MockEmbodiedAgent] planning with min_safe_risk=%.3f", perimeter.min_safe_risk)

        constraints = {
            "battery_pct": 78,
            "max_payload_kg": 5,
            "max_speed_m_s": 1.2,
            "kinematics": "humanoid_biped",
            "thermal_shield": True,
        }

        sub_goals = [
            "定位最近低风险出口（B出口）",
            "清理前方可移动障碍物",
            "启用隔热护盾保护受困人员",
            "沿风险最小路径引导至集结点",
        ]

        actions = [
            ActionPrimitive(
                id="a1",
                label="定位B出口",
                type="navigate",
                params={"target": "exit_B", "planner": "risk_astar"},
                priority=1,
                reason="PerimeterMap 显示东侧通道风险最低",
            ),
            ActionPrimitive(
                id="a2",
                label="清理前方障碍物",
                type="manipulate",
                params={"target": "debris", "force_n": 60},
                priority=2,
                reason="主路径上检测到可移动障碍",
            ),
            ActionPrimitive(
                id="a3",
                label="启用隔热护盾",
                type="shield",
                params={"mode": "thermal", "duration_sec": 180},
                priority=3,
                reason=f"应对{scene.hazard_type}热辐射",
            ),
            ActionPrimitive(
                id="a4",
                label="引导逃生",
                type="guide",
                params={"follow_mode": "close", "muster": "assembly_point_A"},
                priority=4,
                reason="具身智能体执行安全撤离",
            ),
        ]

        feasible = perimeter.min_safe_risk < 0.85 and constraints["battery_pct"] > 20
        plan = TargetActionPlan(
            sub_goals=sub_goals,
            actions=actions,
            robot_constraints=constraints,
            feasible=feasible,
            agent_version="mock-g1-v1",
        )
        logger.info("[MockEmbodiedAgent] feasible=%s actions=%d", feasible, len(actions))
        return plan
