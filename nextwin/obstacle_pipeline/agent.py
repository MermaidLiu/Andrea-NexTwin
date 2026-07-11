"""Phase 1 & 3 — scene confirmation and push-plan embodied agent."""

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


class ObstacleSceneConfirmation(ABC):
    @abstractmethod
    def confirm_scene(self, task: TaskContext, mission_id: str) -> SceneContext:
        ...


class ObstacleEmbodiedAgent(ABC):
    @abstractmethod
    def plan_targets(
        self, task: TaskContext, scene: SceneContext, perimeter: PerimeterMap
    ) -> TargetActionPlan:
        ...


class MockObstacleSceneConfirmation(ObstacleSceneConfirmation):
    def confirm_scene(self, task: TaskContext, mission_id: str) -> SceneContext:
        aligned = task.mission_goal == "clear_obstacle_rescue" or any(
            e.entity_type == "intent" and e.value == "clear_obstacle_rescue" for e in task.entities
        )
        ctx = SceneContext(
            mission_id=mission_id,
            ultimate_goal="clear_obstacle_rescue",
            aligned=aligned,
            building_layout="earthquake_rubble_indoor",
            hazard_type="earthquake_debris",
            initial_risk_level=0.48,
            evacuation_zones=["rubble_channel", "approach_lane"],
            muster_points=["safe_zone_a"],
            rationale=(
                f"任务与「识别障碍 + 搬离解救」对齐={aligned}；"
                "场景：纸箱长方体压着 Mini Pi 被困机器人；"
                "策略：侧向接近 → 施力搬离 → 确认受困目标脱困"
            ),
        )
        logger.info("[ObstacleScene] %s", ctx.rationale)
        return ctx


class MockObstacleEmbodiedAgent(ObstacleEmbodiedAgent):
    def plan_targets(
        self, task: TaskContext, scene: SceneContext, perimeter: PerimeterMap
    ) -> TargetActionPlan:
        push_vec = perimeter.predictions.get("recommended_push_vector", "south_west")
        force = perimeter.predictions.get("safe_push_force_n", 65)

        actions = [
            ActionPrimitive(
                id="a1",
                label="YOLO 锁定长方体",
                type="perceive",
                params={"target": "obstacle_box", "detector": "yolov8"},
                priority=1,
                reason="前方视觉确认纸箱长方体与被困机器人位置关系",
            ),
            ActionPrimitive(
                id="a2",
                label="侧向接近障碍物",
                type="navigate",
                params={"target": "push_point", "planner": "debris_astar"},
                priority=2,
                reason=f"世界模型推荐施力方向 {push_vec}，避开禁行区",
            ),
            ActionPrimitive(
                id="a3",
                label="搬离长方体障碍物",
                type="push",
                params={"target": "obstacle_box", "force_n": force, "distance_m": 1.2},
                priority=3,
                reason="沿安全推力矢量推动纸箱，解除对 Mini Pi 的压迫",
            ),
            ActionPrimitive(
                id="a4",
                label="确认受困机器人状态",
                type="verify",
                params={"target": "mini_pi", "check": "mobility"},
                priority=4,
                reason="搬离后二次感知，确认被困目标可救援",
            ),
        ]

        constraints = {
            "battery_pct": 82,
            "max_push_force_n": 120,
            "max_payload_kg": 12,
            "gripper": "dual_arm_push",
            "kinematics": "humanoid_biped",
        }
        feasible = perimeter.min_safe_risk < 0.75 and constraints["battery_pct"] > 15

        return TargetActionPlan(
            sub_goals=[
                "识别纸箱长方体与被困机器人",
                "规划侧向安全接近路径",
                "施力搬离障碍物",
                "验证 Mini Pi 脱困",
            ],
            actions=actions,
            robot_constraints=constraints,
            feasible=feasible,
            agent_version="g1-earthquake-v1",
        )
