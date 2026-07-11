"""Natural language → task blueprint (rescue or obstacle MVP)."""

from __future__ import annotations

import uuid

from nextwin.config import (
    OBSTACLE_DEFAULT_INSTRUCTION,
    RESCUE_DEFAULT_INSTRUCTION,
    RESCUE_PHASE_DURATIONS,
)
from nextwin.models import RescuePhase, TaskBlueprint, TaskStep

OBSTACLE_KEYWORDS = (
    "障碍", "长方体", "搬离", "搬走", "清除", "方块", "box", "obstacle", "通道",
    "地震", "纸箱", "纸盒", "压着", "被困",
)

_BASE_STEPS = [
    (RescuePhase.ISSUE_COMMAND, "指令下达", "接收并解析任务指令"),
    (RescuePhase.ROBOT_START, "机器人启动", "Unitree 系统自检并启动"),
    (RescuePhase.UNITREE_SENSING, "雷达+视觉感知", "Livox + RealSense 采集环境"),
    (RescuePhase.SPLIT_VIEWS, "四向画面切分", "前/后/左/右四视角"),
    (RescuePhase.YOLO_DETECT, "YOLO 目标识别", "识别场景目标"),
    (RescuePhase.OBSERVATION_JSON, "观察结果 JSON", "结构化感知报告"),
    (RescuePhase.RULE_ENGINE, "规则引擎决策", "规划动作序列"),
    (RescuePhase.ROBOT_EXECUTE, "机器人执行", "转向 → 前进 → 停止 → 推/搬"),
    (RescuePhase.RESCUE_SUCCESS, "任务完成", "目标达成"),
    (RescuePhase.DISPLAY_RESULT, "结果展示", "大屏展示执行结果"),
]

_SCENARIO_LABELS = {
    "rescue": {
        RescuePhase.YOLO_DETECT: ("YOLO 目标识别", "识别被重物压住的 Mini Pi"),
        RescuePhase.ROBOT_EXECUTE: ("宇树执行动作", "转向 → 前进 → 停止 → 推开重物"),
        RescuePhase.RESCUE_SUCCESS: ("解救 Mini Pi", "成功移开重物，Mini Pi 脱困"),
    },
    "obstacle": {
        RescuePhase.YOLO_DETECT: ("YOLO 场景识别", "识别纸箱长方体 + 被困 Mini Pi"),
        RescuePhase.ROBOT_EXECUTE: ("执行搬离", "侧向接近 → 施力搬离长方体"),
        RescuePhase.RESCUE_SUCCESS: ("解救完成", "纸箱已搬离，Mini Pi 脱困"),
    },
}


def _build_steps(scenario: str) -> list[TaskStep]:
    labels = _SCENARIO_LABELS.get(scenario, {})
    steps: list[TaskStep] = []
    for phase, default_label, default_desc in _BASE_STEPS:
        label, desc = labels.get(phase, (default_label, default_desc))
        steps.append(
            TaskStep(
                phase=phase.value,
                label=label,
                description=desc,
                duration_sec=RESCUE_PHASE_DURATIONS[phase.value],
            )
        )
    return steps


def detect_scenario(instruction: str, scene_override: str | None = None) -> str:
    if scene_override in ("obstacle", "rescue"):
        return scene_override
    text = (instruction or "").lower()
    if any(k in text for k in OBSTACLE_KEYWORDS):
        return "obstacle"
    return "rescue"


def parse_rescue_instruction(instruction: str) -> TaskBlueprint:
    instruction = (instruction or RESCUE_DEFAULT_INSTRUCTION).strip()
    return TaskBlueprint(
        scene="rescue_mini_pi",
        scene_label="具身智能无人救援场景",
        instruction=instruction,
        scenario="rescue",
        target="mini_pi",
        objects=["unitree", "mini_pi", "heavy_debris", "debris_zone", "safe_zone"],
        steps=_build_steps("rescue"),
    )


def parse_obstacle_instruction(instruction: str) -> TaskBlueprint:
    instruction = (instruction or OBSTACLE_DEFAULT_INSTRUCTION).strip()
    return TaskBlueprint(
        scene="earthquake_box_rescue",
        scene_label="地震救援 · 纸箱压机器人 · 搬离障碍",
        instruction=instruction,
        scenario="obstacle",
        target="obstacle_box",
        objects=["unitree", "obstacle_box", "mini_pi", "path_zone", "safe_zone"],
        steps=_build_steps("obstacle"),
    )


def parse_instruction_sync(instruction: str, scene_override: str | None = None) -> TaskBlueprint:
    scenario = detect_scenario(instruction, scene_override)
    if scenario == "obstacle":
        return parse_obstacle_instruction(instruction)
    return parse_rescue_instruction(instruction)


async def parse_instruction(
    instruction: str,
    scene_override: str | None = None,
) -> tuple[TaskBlueprint, str]:
    blueprint = parse_instruction_sync(instruction, scene_override)
    return blueprint, blueprint.scenario


def new_task_id(scenario: str = "rescue") -> str:
    prefix = "obstacle" if scenario == "obstacle" else "rescue"
    return f"{prefix}_{uuid.uuid4().hex[:8]}"
