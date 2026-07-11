"""Rule engine — map observation to robot action plan."""

from __future__ import annotations

from nextwin.models import ActionPlan, ObservationResult, RobotAction, RobotActionType
from nextwin.physics import estimate_forward_distance


def plan_actions(obs: ObservationResult, scenario: str = "rescue") -> ActionPlan:
    if scenario == "obstacle":
        return plan_obstacle_clearance(obs)
    return plan_rescue(obs)


def plan_rescue(obs: ObservationResult) -> ActionPlan:
    """Deterministic rule engine for Mini Pi rescue scenario."""
    target_view = obs.target.get("view", "front")
    turn_map = {"front": 0, "left": -45, "right": 45, "back": 180}
    turn_deg = turn_map.get(target_view, 0)

    actions = [
        RobotAction(
            action=RobotActionType.TURN,
            label="转向",
            params={"direction": "left" if turn_deg < 0 else "right", "degrees": abs(turn_deg)},
            reason=f"目标在{target_view}方向，需转向 {abs(turn_deg)}° 对准 Mini Pi",
        ),
        RobotAction(
            action=RobotActionType.FORWARD,
            label="前进",
            params={"distance_m": 1.5},
            reason="接近被压住的 Mini Pi 位置",
        ),
        RobotAction(
            action=RobotActionType.STOP,
            label="停止",
            params={},
            reason="到达推重物操作点，准备实施救援",
        ),
        RobotAction(
            action=RobotActionType.PUSH,
            label="推开重物",
            params={"target": "heavy_debris", "direction": "forward", "force_n": 120},
            reason="推开压住 Mini Pi 的重物",
        ),
    ]
    return ActionPlan(actions=actions, rule_version="v1.0-rescue")


def plan_obstacle_clearance(obs: ObservationResult) -> ActionPlan:
    """MVP: detect box → walk → push away."""
    target_view = obs.target.get("view", "front")
    turn_map = {"front": 0, "left": -45, "right": 45, "back": 180}
    turn_deg = turn_map.get(target_view, 0)
    target_pos = obs.target.get("position_estimate", [-2.0, 0.25, -1.5])
    robot_home = [0.0, 0.0, 0.0]
    forward_m = estimate_forward_distance(target_pos, robot_home)

    actions = [
        RobotAction(
            action=RobotActionType.TURN,
            label="转向障碍物",
            params={"direction": "left" if turn_deg < 0 else "right", "degrees": abs(turn_deg) or 15},
            reason=f"YOLO 在{target_view}方向检测到长方体障碍物，转向对准",
        ),
        RobotAction(
            action=RobotActionType.FORWARD,
            label="接近障碍物",
            params={"distance_m": round(forward_m, 2)},
            reason=f"沿规划路径接近障碍物（约 {forward_m:.1f}m）",
        ),
        RobotAction(
            action=RobotActionType.STOP,
            label="停止",
            params={},
            reason="到达操作点，准备搬离",
        ),
        RobotAction(
            action=RobotActionType.PUSH,
            label="搬离长方体",
            params={
                "target": "obstacle_box",
                "direction": "forward",
                "force_n": 80,
                "push_distance_m": 1.2,
            },
            reason="推动长方体障碍物离开通道",
        ),
    ]
    return ActionPlan(actions=actions, rule_version="v1.0-obstacle-mvp")


def action_plan_to_dict(plan: ActionPlan) -> dict:
    return {
        "rule_version": plan.rule_version,
        "actions": [
            {
                "action": a.action.value,
                "label": a.label,
                "params": a.params,
                "reason": a.reason,
                "status": a.status,
            }
            for a in plan.actions
        ],
    }
