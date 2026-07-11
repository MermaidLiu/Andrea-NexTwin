"""Pydantic data models for NexTwin Studio."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Legacy maintenance phases ──
class TaskPhase(str, Enum):
    SCAN_WORKSPACE = "scan_workspace"
    GENERATE_DIGITAL_TWIN = "generate_digital_twin"
    ROBOT_PATROL = "robot_patrol"
    DETECT_FAULT_PART = "detect_fault_part"
    GENERATE_REPLACEMENT_PART = "generate_replacement_part"
    SEND_TO_3D_PRINTER = "send_to_3d_printer"
    UPDATE_TWIN_STATUS = "update_twin_status"


# ── Rescue 10-step flow ──
class RescuePhase(str, Enum):
    ISSUE_COMMAND = "issue_command"           # 1 救援指令下达
    ROBOT_START = "robot_start"                 # 2 宇树机器人启动
    UNITREE_SENSING = "unitree_sensing"         # 3 宇树雷达+视觉感知
    SPLIT_VIEWS = "split_views"                 # 4 前后左右四向切分
    YOLO_DETECT = "yolo_detect"                 # 5 YOLO识别 Mini Pi
    OBSERVATION_JSON = "observation_json"         # 6 观察结果JSON
    RULE_ENGINE = "rule_engine"                 # 7 规则引擎判断
    ROBOT_EXECUTE = "robot_execute"             # 8 转向|前进|停止|推重物
    RESCUE_SUCCESS = "rescue_success"             # 9 成功解救
    DISPLAY_RESULT = "display_result"           # 10 大屏显示结果


class RobotActionType(str, Enum):
    TURN = "turn"
    FORWARD = "forward"
    STOP = "stop"
    PUSH = "push"


class ObjectState(str, Enum):
    NORMAL = "normal"
    FAULT = "fault"
    TRAPPED = "trapped"
    RESCUED = "rescued"
    CLEARED = "cleared"


class SceneObject(BaseModel):
    id: str
    label: str
    type: str
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    state: ObjectState = ObjectState.NORMAL
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskStep(BaseModel):
    phase: str
    label: str
    description: str
    duration_sec: float = 2.0


class TaskBlueprint(BaseModel):
    scene: str
    scene_label: str
    instruction: str
    objects: list[str]
    steps: list[TaskStep]
    scenario: str = "rescue"
    target: str = "mini_pi"


class ViewDetection(BaseModel):
    view: str  # front | back | left | right
    class_name: str
    label: str
    confidence: float
    bbox: list[float]
    color: str = "#ef4444"
    is_target: bool = False


class ObservationResult(BaseModel):
    timestamp: str
    panorama_source: str = "unitree_lidar_vision"
    views: dict[str, list[ViewDetection]] = Field(default_factory=dict)
    target: dict[str, Any] = Field(default_factory=dict)
    scene_assessment: str = "unknown"
    detector_mode: str = "mock"


class RobotAction(BaseModel):
    action: RobotActionType
    label: str
    params: dict[str, Any] = Field(default_factory=dict)
    reason: str = ""
    status: str = "pending"  # pending | running | done


class ActionPlan(BaseModel):
    actions: list[RobotAction] = Field(default_factory=list)
    rule_version: str = "v1.0"


class DetectionResult(BaseModel):
    class_name: str
    label: str
    confidence: float
    bbox: list[float]
    view: str = "front"
    scene_position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    is_rescue_target: bool = False
    color: str = "#ef4444"


class WorldModelState(BaseModel):
    scene: str = "idle"
    scene_label: str = ""
    scenario: str = "rescue"
    objects: list[SceneObject] = Field(default_factory=list)
    robot_position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    robot_heading: float = 0.0
    robot_target: list[float] | None = None
    current_phase: str | None = None
    phase_index: int = -1
    progress: float = 0.0
    status: str = "idle"
    message: str = "等待救援指令"
    rescue_complete: bool = False
    blueprint: TaskBlueprint | None = None
    observation: ObservationResult | None = None
    action_plan: ActionPlan | None = None
    current_action: RobotAction | None = None
    split_views: dict[str, str] = Field(default_factory=dict)  # view -> base64 thumbnail
    sensor_mode: str = "mock"
    lidar_stats: dict[str, Any] = Field(default_factory=dict)
    bev_preview_b64: str = ""
    camera_preview_b64: str = ""
    panorama_preview_b64: str = ""  # alias for bev preview (compat)
    rescue_targets: list[DetectionResult] = Field(default_factory=list)
    logs: list[dict[str, Any]] = Field(default_factory=list)


class TaskRequest(BaseModel):
    instruction: str
    scene_override: str | None = None


class TaskResponse(BaseModel):
    task_id: str
    blueprint: TaskBlueprint
    world_model: WorldModelState


class ExecuteRequest(BaseModel):
    task_id: str | None = None
    use_simulation: bool = True


class AnalyzeRequest(BaseModel):
    source: str | None = None
    scenario: str = "rescue"


class SystemStatus(BaseModel):
    system: str = "NexTwin Studio"
    version: str = "0.2.0"
    status: str
    message: str
    components: dict[str, dict[str, str]]
