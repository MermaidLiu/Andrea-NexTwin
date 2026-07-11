"""Phase 0 — natural language parsing (mock NLP)."""

from __future__ import annotations

import re
import uuid

from nextwin.evacuation.models import SemanticEntity, TaskContext

HAZARD_KEYWORDS = {
    "火": "fire",
    "fire": "fire",
    "烟": "smoke",
    "smoke": "smoke",
    "坍塌": "collapse",
    "collapse": "collapse",
    "地震": "earthquake",
    "毒气": "gas",
}

LOCATION_KEYWORDS = ("厨房", "客厅", "走廊", "楼梯", "出口", "kitchen", "hallway", "exit", "B出口")


def parse_language_input(instruction: str) -> TaskContext:
    """Extract semantic entities and initialize rescue task context."""
    text = (instruction or "").strip()
    lower = text.lower()
    entities: list[SemanticEntity] = []

    hazard_types: list[str] = []
    for kw, hazard in HAZARD_KEYWORDS.items():
        if kw in lower or kw in text:
            if hazard not in hazard_types:
                hazard_types.append(hazard)
            entities.append(SemanticEntity(entity_type="hazard", value=hazard, confidence=0.88))

    locations: list[str] = []
    for loc in LOCATION_KEYWORDS:
        if loc.lower() in lower or loc in text:
            locations.append(loc)
            entities.append(SemanticEntity(entity_type="location", value=loc, confidence=0.82))

    if any(k in lower for k in ("逃", "撤离", "安全", "evacuat", "escape", "safe")):
        entities.append(SemanticEntity(entity_type="intent", value="safe_evacuation", confidence=0.95))

    if re.search(r"带我|引导|lead|guide", lower):
        entities.append(SemanticEntity(entity_type="action", value="guide_human", confidence=0.8))

    if not hazard_types:
        hazard_types = ["fire"]
    if not locations:
        locations = ["kitchen"]

    urgency = "critical" if any(k in lower for k in ("快", "紧急", "越来越", "urgent", "now")) else "high"

    return TaskContext(
        instruction=text or "厨房起火了，烟雾越来越大，请带我安全逃生。",
        mission_goal="safe_evacuation",
        entities=entities,
        hazard_types=hazard_types,
        locations=locations,
        urgency=urgency,
        raw_intent="evacuate_to_safe_zone",
    )


def new_mission_id() -> str:
    return f"evac_{uuid.uuid4().hex[:8]}"
