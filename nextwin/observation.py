"""Generate structured observation JSON from RTV analysis."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from nextwin.models import ObservationResult, ViewDetection


def build_observation(
    views: dict[str, list[dict[str, Any]]],
    target_view: str,
    target_detection: dict[str, Any],
    detector_mode: str = "mock",
    sensor_source: str = "unitree_lidar_vision",
    lidar_stats: dict[str, Any] | None = None,
    sensor_mode: str = "mock",
    scenario: str = "rescue",
) -> ObservationResult:
    view_models: dict[str, list[ViewDetection]] = {}
    for view_name, dets in views.items():
        view_models[view_name] = [
            ViewDetection(
                view=view_name,
                class_name=d.get("class", ""),
                label=d.get("label", ""),
                confidence=d.get("confidence", 0),
                bbox=d.get("bbox", []),
                color=d.get("color", "#64748b"),
                is_target=d.get("is_target", False),
            )
            for d in dets
        ]

    if scenario == "obstacle":
        target = {
            "id": "obstacle_box",
            "label": target_detection.get("label", "长方体障碍物"),
            "view": target_view,
            "bbox": target_detection.get("bbox", []),
            "confidence": target_detection.get("confidence", 0),
            "position_estimate": target_detection.get("scene_position", [-2.0, 0.25, -1.5]),
            "shape": "box",
        }
        assessment = "obstacle_box_blocking_path"
    else:
        target = {
            "id": "mini_pi",
            "label": "Mini Pi 被重物压住",
            "view": target_view,
            "bbox": target_detection.get("bbox", []),
            "confidence": target_detection.get("confidence", 0),
            "blocked_by": "heavy_debris",
            "position_estimate": target_detection.get("scene_position", [-2.5, 0.15, -1.8]),
        }
        assessment = "mini_pi_trapped_needs_rescue"

    return ObservationResult(
        timestamp=datetime.now(timezone.utc).isoformat(),
        panorama_source=sensor_source,
        views=view_models,
        target=target,
        scene_assessment=assessment,
        detector_mode=detector_mode,
    )


def observation_to_dict(obs: ObservationResult, extra: dict | None = None) -> dict[str, Any]:
    d = {
        "timestamp": obs.timestamp,
        "sensor_source": obs.panorama_source,
        "views": {k: [v.model_dump() for v in vals] for k, vals in obs.views.items()},
        "target": obs.target,
        "scene_assessment": obs.scene_assessment,
        "detector_mode": obs.detector_mode,
    }
    if extra:
        d.update(extra)
    return d
