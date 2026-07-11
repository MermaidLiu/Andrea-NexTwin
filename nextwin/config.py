"""Application configuration."""

from __future__ import annotations

import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT_DIR / "web"
CONFIGS_DIR = ROOT_DIR / "configs"
ASSETS_DIR = ROOT_DIR / "assets"

RESCUE_DEFAULT_INSTRUCTION = (
    "执行无人救援任务：宇树机器人启动后，"
    "通过 onboard 雷达+视觉感知找到被重物压住的 Mini Pi 并实施救援。"
)

OBSTACLE_DEFAULT_INSTRUCTION = (
    "地震救援现场：纸箱子压着被困机器人，请识别场景并搬离前方长方体障碍物，解救受困目标。"
)

# MVP 演示默认场景（可通过 NEXTWIN_DEMO_SCENARIO=rescue 切回救援）
DEMO_SCENARIO = os.getenv("NEXTWIN_DEMO_SCENARIO", "obstacle")

# Unitree G1 sensor defaults (Livox Mid360 + RealSense D435i)
UNITREE_ROBOT_MODEL = os.getenv("UNITREE_ROBOT_MODEL", "g1")
# ros2 | sdk | mock  — 默认 ros2，使用 G1 onboard 相机 + 雷达
UNITREE_SENSOR_MODE = os.getenv("UNITREE_SENSOR_MODE", "ros2")
UNITREE_LIDAR_MODE = os.getenv("UNITREE_LIDAR_MODE", "ros2")  # mock | ros2
UNITREE_LIDAR_TOPIC = os.getenv("UNITREE_LIDAR_TOPIC", "/utlidar/cloud")
UNITREE_CAMERA_TOPIC = os.getenv("UNITREE_CAMERA_TOPIC", "/camera/color/image_raw")
UNITREE_DEPTH_TOPIC = os.getenv("UNITREE_DEPTH_TOPIC", "/camera/depth/image_rect_raw")
UNITREE_IMU_TOPIC = os.getenv("UNITREE_IMU_TOPIC", "/utlidar/imu")
UNITREE_NETWORK_IFACE = os.getenv("UNITREE_NETWORK_IFACE", "eth0")
UNITREE_SENSOR_TIMEOUT = float(os.getenv("UNITREE_SENSOR_TIMEOUT", "5.0"))
UNITREE_CONTROL_MODE = os.getenv("UNITREE_CONTROL_MODE", "mock")  # mock | ros2

# YOLO — 默认启用；COCO 演示映射（无自训练模型时用常见类别代替 Mini Pi / 重物）
RTV_VIEW_SIZE = int(os.getenv("RTV_VIEW_SIZE", "640"))
YOLO_ENABLE = os.getenv("NEXTWIN_ENABLE_YOLO", "1") == "1"
YOLO_COCO_DEMO = os.getenv("NEXTWIN_COCO_DEMO", "1") == "1"
YOLO_MODEL = os.getenv("YOLO_MODEL", "yolov8n.pt")  # 或 models/rescue_yolo.pt
YOLO_CONF = float(os.getenv("YOLO_CONF", "0.25"))
YOLO_DEVICE = os.getenv("YOLO_DEVICE", "cpu")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

HOST = os.getenv("NEXTWIN_HOST", "0.0.0.0")
PORT = int(os.getenv("NEXTWIN_PORT", "8080"))

# Rescue 10-step phase durations (seconds)
RESCUE_PHASE_DURATIONS = {
    "issue_command": 1.5,
    "robot_start": 2.0,
    "unitree_sensing": 3.0,
    "split_views": 2.0,
    "yolo_detect": 3.0,
    "observation_json": 1.5,
    "rule_engine": 2.0,
    "robot_execute": 8.0,
    "rescue_success": 2.0,
    "display_result": 2.0,
}

RESCUE_SCENE_OBJECTS = [
    {"id": "unitree", "label": "宇树机器人", "type": "robot", "position": [0, 0, 0]},
    {"id": "mini_pi", "label": "Mini Pi", "type": "victim", "position": [-2.5, 0.15, -1.8]},
    {"id": "heavy_debris", "label": "重物", "type": "obstacle", "position": [-2.8, 0.4, -1.5]},
    {"id": "debris_zone", "label": "坍塌区域", "type": "zone", "position": [-3.0, 0, -2.0]},
    {"id": "safe_zone", "label": "安全区", "type": "zone", "position": [3.0, 0, 2.0]},
]

ROBOT_WAYPOINTS_RESCUE = {
    "home": [0.0, 0.0, 0.0],
    "approach": [-1.5, 0.0, -1.0],
    "push_point": [-2.2, 0.0, -1.6],
    "mini_pi": [-2.5, 0.0, -1.8],
    "safe_zone": [3.0, 0.0, 2.0],
}

OBSTACLE_SCENE_OBJECTS = [
    {"id": "unitree", "label": "宇树 G1 机器人", "type": "robot", "position": [0, 0, 0]},
    {
        "id": "obstacle_box",
        "label": "纸箱长方体障碍物",
        "type": "obstacle",
        "position": [-2.0, 0.35, -1.5],
        "metadata": {"shape": "box", "size": [0.7, 0.45, 0.55], "mass_kg": 8.0, "material": "cardboard"},
    },
    {
        "id": "mini_pi",
        "label": "Mini Pi (被压)",
        "type": "victim",
        "position": [-2.0, 0.1, -1.5],
        "metadata": {"trapped_by": "obstacle_box"},
    },
    {"id": "path_zone", "label": "废墟通道", "type": "zone", "position": [-1.0, 0, -0.8]},
    {"id": "safe_zone", "label": "安全区", "type": "zone", "position": [2.5, 0, 1.5]},
]

ROBOT_WAYPOINTS_OBSTACLE = {
    "home": [0.0, 0.0, 0.0],
    "approach": [-1.2, 0.0, -1.0],
    "push_point": [-1.8, 0.0, -1.4],
    "clear_zone": [0.5, 0.0, 0.5],
}

# 4-view directions for ERP split
VIEW_DIRECTIONS = {
    "front": {"yaw": 0, "label": "前方"},
    "right": {"yaw": 90, "label": "右方"},
    "back": {"yaw": 180, "label": "后方"},
    "left": {"yaw": 270, "label": "左方"},
}
