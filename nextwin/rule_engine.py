"""Rule engine — map observation to robot action plan."""

from __future__ import annotations

from nextwin.models import ActionPlan, ObservationResult, RobotAction, RobotActionType


def plan_actions(obs: ObservationResult) -> ActionPlan:
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

    return ActionPlan(actions=actions, rule_version="v1.0")


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
