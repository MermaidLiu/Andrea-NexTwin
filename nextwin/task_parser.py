"""Natural language → rescue task blueprint (10-step flow)."""

from __future__ import annotations

import uuid

from nextwin.config import RESCUE_DEFAULT_INSTRUCTION, RESCUE_PHASE_DURATIONS
from nextwin.models import RescuePhase, TaskBlueprint, TaskStep


RESCUE_STEPS = [
    TaskStep(phase=RescuePhase.ISSUE_COMMAND.value, label="救援指令下达", description="接收并解析无人救援任务指令", duration_sec=RESCUE_PHASE_DURATIONS["issue_command"]),
    TaskStep(phase=RescuePhase.ROBOT_START.value, label="宇树机器人启动", description="Unitree 机器人系统自检并启动", duration_sec=RESCUE_PHASE_DURATIONS["robot_start"]),
    TaskStep(phase=RescuePhase.UNITREE_SENSING.value, label="G1 雷达+视觉感知", description="Livox Mid360 点云 + RealSense D435i 采集", duration_sec=RESCUE_PHASE_DURATIONS["unitree_sensing"]),
    TaskStep(phase=RescuePhase.SPLIT_VIEWS.value, label="四向画面切分", description="全景图切分为前/后/左/右四个视角", duration_sec=RESCUE_PHASE_DURATIONS["split_views"]),
    TaskStep(phase=RescuePhase.YOLO_DETECT.value, label="YOLO 目标识别", description="识别被重物压住的 Mini Pi", duration_sec=RESCUE_PHASE_DURATIONS["yolo_detect"]),
    TaskStep(phase=RescuePhase.OBSERVATION_JSON.value, label="观察结果 JSON", description="汇总检测结果生成结构化观察报告", duration_sec=RESCUE_PHASE_DURATIONS["observation_json"]),
    TaskStep(phase=RescuePhase.RULE_ENGINE.value, label="规则引擎决策", description="基于观察结果规划机器人动作序列", duration_sec=RESCUE_PHASE_DURATIONS["rule_engine"]),
    TaskStep(phase=RescuePhase.ROBOT_EXECUTE.value, label="宇树执行动作", description="转向 → 前进 → 停止 → 推开重物", duration_sec=RESCUE_PHASE_DURATIONS["robot_execute"]),
    TaskStep(phase=RescuePhase.RESCUE_SUCCESS.value, label="解救 Mini Pi", description="成功移开重物，Mini Pi 脱困", duration_sec=RESCUE_PHASE_DURATIONS["rescue_success"]),
    TaskStep(phase=RescuePhase.DISPLAY_RESULT.value, label="大屏显示结果", description="前端大屏展示任务执行结果与状态", duration_sec=RESCUE_PHASE_DURATIONS["display_result"]),
]


def parse_rescue_instruction(instruction: str) -> TaskBlueprint:
    instruction = (instruction or RESCUE_DEFAULT_INSTRUCTION).strip()
    return TaskBlueprint(
        scene="rescue_mini_pi",
        scene_label="具身智能无人救援场景",
        instruction=instruction,
        scenario="rescue",
        target="mini_pi",
        objects=["unitree", "mini_pi", "heavy_debris", "debris_zone", "safe_zone"],
        steps=[s.model_copy(deep=True) for s in RESCUE_STEPS],
    )


async def parse_instruction(instruction: str) -> tuple[TaskBlueprint, str]:
    return parse_rescue_instruction(instruction), "rescue"


def new_task_id() -> str:
    return f"rescue_{uuid.uuid4().hex[:8]}"
