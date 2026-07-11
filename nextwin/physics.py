"""Minimal physics for obstacle MVP — box push along robot heading."""

from __future__ import annotations

import math
from typing import Any


def push_box_position(
    position: list[float],
    heading_deg: float,
    distance_m: float = 1.2,
    scale: float = 0.3,
) -> list[float]:
    """Move a box along robot forward direction (same scale as robot kinematics)."""
    rad = math.radians(heading_deg)
    return [
        position[0] + distance_m * math.sin(rad) * scale,
        position[1],
        position[2] - distance_m * math.cos(rad) * scale,
    ]


def estimate_forward_distance(target_position: list[float], robot_position: list[float]) -> float:
    """Rough meters to target in scene plane."""
    dx = target_position[0] - robot_position[0]
    dz = target_position[2] - robot_position[2]
    plane_dist = math.hypot(dx, dz)
    return max(0.8, min(2.5, plane_dist / 0.3))
