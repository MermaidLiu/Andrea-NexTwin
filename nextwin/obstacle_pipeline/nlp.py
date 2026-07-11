"""Phase 0 — earthquake obstacle rescue language parsing."""

from __future__ import annotations

import uuid

from nextwin.evacuation.models import SemanticEntity, TaskContext

DEFAULT_INSTRUCTION = (
    "地震救援现场：纸箱子压着被困机器人，请识别场景并搬离前方长方体障碍物，解救受困目标。"
)


def parse_language_input(instruction: str) -> TaskContext:
    text = (instruction or DEFAULT_INSTRUCTION).strip()
    lower = text.lower()
    entities: list[SemanticEntity] = []

    if any(k in text for k in ("地震", "坍塌", "废墟", "earthquake", "disaster")):
        entities.append(SemanticEntity(entity_type="disaster", value="earthquake", confidence=0.93))
    if any(k in lower for k in ("纸箱", "纸盒", "paper box", "cardboard")):
        entities.append(SemanticEntity(entity_type="object", value="cardboard_box", confidence=0.9))
    if any(k in text for k in ("长方体", "盒子", "障碍物", "box", "obstacle")):
        entities.append(SemanticEntity(entity_type="object", value="obstacle_box", confidence=0.92))
    if any(k in text for k in ("机器人", "被困", "压着", "robot", "trapped")):
        entities.append(SemanticEntity(entity_type="victim", value="trapped_robot", confidence=0.94))
    if any(k in text for k in ("识别", "搬离", "搬开", "清除", "detect", "clear", "push")):
        entities.append(SemanticEntity(entity_type="intent", value="clear_obstacle_rescue", confidence=0.96))

    hazard_types = ["earthquake_debris"]
    locations = ["废墟通道"]
    if "前方" in text:
        locations.append("前方")

    return TaskContext(
        instruction=text,
        mission_goal="clear_obstacle_rescue",
        entities=entities,
        hazard_types=hazard_types,
        locations=locations,
        urgency="high",
        raw_intent="detect_and_push_obstacle_box",
    )


def new_mission_id() -> str:
    return f"eq_{uuid.uuid4().hex[:8]}"
