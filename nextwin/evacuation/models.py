"""Pydantic data models for the evacuation workflow pipeline."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class WorkflowPhase(str, Enum):
    LANGUAGE_INPUT = "phase_0_language_input"
    SCENE_CONFIRMATION = "phase_1_scene_confirmation"
    PERIMETER_JUDGMENT = "phase_2_perimeter_judgment"
    TARGET_ALIGNMENT = "phase_3_target_alignment"
    OUTPUT_VALIDATION = "phase_4_output_validation"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    EXECUTING = "executing"
    COMPLETED = "completed"
    SHELTER_FALLBACK = "shelter_fallback"


class SemanticEntity(BaseModel):
    entity_type: str
    value: str
    confidence: float = Field(ge=0.0, le=1.0)


class TaskContext(BaseModel):
    """Phase 0 output — parsed natural language mission context."""

    instruction: str
    mission_goal: str = "safe_evacuation"
    entities: list[SemanticEntity] = Field(default_factory=list)
    hazard_types: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    urgency: str = "high"
    raw_intent: str = ""


class SceneContext(BaseModel):
    """Phase 1 output — scene confirmation aligned to safe evacuation."""

    mission_id: str
    ultimate_goal: str = "safe_evacuation"
    aligned: bool = True
    building_layout: str = "multi_room_indoor"
    hazard_type: str = "fire"
    initial_risk_level: float = Field(ge=0.0, le=1.0, default=0.6)
    evacuation_zones: list[str] = Field(default_factory=list)
    muster_points: list[str] = Field(default_factory=list)
    rationale: str = ""


class RiskCell(BaseModel):
    x: int
    y: int
    risk: float = Field(ge=0.0, le=1.0)
    is_no_go: bool = False


class NoGoZone(BaseModel):
    zone_id: str
    label: str
    cells: list[tuple[int, int]] = Field(default_factory=list)
    reason: str = ""


class PerimeterMap(BaseModel):
    """Phase 2 output — world-model-driven risk perimeter."""

    grid_width: int = 8
    grid_height: int = 8
    risk_grid: list[RiskCell] = Field(default_factory=list)
    no_go_zones: list[NoGoZone] = Field(default_factory=list)
    safe_boundary: list[dict[str, Any]] = Field(default_factory=list)
    predictions: dict[str, Any] = Field(default_factory=dict)
    world_model_version: str = "mock-v1"
    min_safe_risk: float = 0.0


class ActionPrimitive(BaseModel):
    id: str
    label: str
    type: str
    params: dict[str, Any] = Field(default_factory=dict)
    priority: int = 1
    reason: str = ""


class TargetActionPlan(BaseModel):
    """Phase 3 output — embodied agent action sequence."""

    sub_goals: list[str] = Field(default_factory=list)
    actions: list[ActionPrimitive] = Field(default_factory=list)
    robot_constraints: dict[str, Any] = Field(default_factory=dict)
    feasible: bool = True
    agent_version: str = "mock-g1-v1"


class PathWaypoint(BaseModel):
    x: float
    y: float
    z: float = 0.0
    label: str = ""


class EvacuationPath(BaseModel):
    waypoints: list[PathWaypoint] = Field(default_factory=list)
    total_risk: float = Field(ge=0.0, le=1.0, default=0.0)
    estimated_time_sec: float = 0.0
    topology: str = "grid_astar"


class WorkflowOutput(BaseModel):
    """Phase 4 output — plan presentation for user validation."""

    optimal_path: EvacuationPath
    solution_steps: list[str] = Field(default_factory=list)
    world_model_rationale: str = ""
    contingency_notes: list[str] = Field(default_factory=list)
    requires_confirmation: bool = True


class EvacuationWorkflowState(BaseModel):
    """Full suspendable workflow state passed between phases."""

    session_id: str
    phase: WorkflowPhase = WorkflowPhase.LANGUAGE_INPUT
    task_context: TaskContext | None = None
    scene_context: SceneContext | None = None
    perimeter_map: PerimeterMap | None = None
    action_plan: TargetActionPlan | None = None
    output: WorkflowOutput | None = None
    user_confirmed: bool | None = None
    feedback: str | None = None
    fallback_protocol: str | None = None
    logs: list[str] = Field(default_factory=list)
    error: str | None = None


class StartEvacuationRequest(BaseModel):
    instruction: str
    world_model_id: str | None = None
    robot_id: str | None = None


class ConfirmEvacuationRequest(BaseModel):
    approved: bool
    feedback: str = ""
