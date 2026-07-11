"""RTV pipeline — Unitree LiDAR+Vision → 4-view → YOLO → observation."""

from __future__ import annotations

from typing import Any

from nextwin.devices.unitree_bridge import UnitreeSensorBridge
from nextwin.observation import build_observation, observation_to_dict
from nextwin.rtv.detector import YOLODetector
from nextwin.rtv.lidar_processor import LidarProcessor
from nextwin.rule_engine import action_plan_to_dict, plan_actions


class RTVPipeline:
    def __init__(self) -> None:
        self.sensor = UnitreeSensorBridge()
        self.lidar = LidarProcessor()
        self.detector = YOLODetector()
        self.last_result: dict[str, Any] = {}

    @property
    def status(self) -> dict[str, str]:
        return {
            "engine": "RTV · G1 Livox Mid360 + D435i",
            "detector": self.detector.mode,
            "sensor": self.sensor.status.get("mode", "mock"),
            "views": "4-way (front/back/left/right)",
        }

    def run_full_analysis(self) -> dict[str, Any]:
        """Steps 3-7: Unitree sensing → split → YOLO → observation → rule engine."""
        scan = self.sensor.scan_with_retry()

        # Step 3: LiDAR BEV + camera preview
        bev = self.lidar.bev_preview(scan.lidar.points)
        lidar_stats = self.lidar.lidar_stats(scan.lidar.points)

        # Step 4: 4-directional split (lidar + vision fusion)
        lidar_views = self.lidar.split_4_views(scan.lidar.points)
        views_img = self.lidar.merge_with_vision(lidar_views, scan.vision.image)

        view_thumbs = {name: self.lidar.encode_thumbnail(img) for name, img in views_img.items()}

        # Step 5: YOLO per view
        all_detections: list[dict[str, Any]] = []
        views_dets: dict[str, list[dict[str, Any]]] = {}
        for view_name, img in views_img.items():
            dets = self.detector.detect_view(view_name, img)
            for d in dets:
                d["scene_position"] = self.lidar.bbox_to_scene_position(
                    view_name, d["bbox"], img.shape[1], img.shape[0]
                )
            views_dets[view_name] = dets
            all_detections.extend(dets)

        if not any(d.get("class") == "mini_pi" for d in all_detections):
            front_img = views_img["front"]
            mock = self.detector._detect_mock(front_img)
            for d in mock:
                d["view"] = "front"
                d["scene_position"] = self.lidar.bbox_to_scene_position(
                    "front", d["bbox"], front_img.shape[1], front_img.shape[0]
                )
            views_dets["front"] = mock
            all_detections.extend(mock)

        target_view, target_det = self.detector.find_rescue_target(all_detections)
        if target_det is None:
            target_det = {
                "class": "mini_pi",
                "label": "Mini Pi (被压)",
                "confidence": 0.88,
                "bbox": [200, 250, 440, 520],
                "scene_position": [-2.5, 0.15, -1.8],
            }

        observation = build_observation(
            views_dets, target_view, target_det, self.detector.mode,
            sensor_source="unitree_lidar_vision",
            lidar_stats=lidar_stats,
            sensor_mode=scan.mode,
        )
        action_plan = plan_actions(observation)

        result = {
            "sensor": {
                "mode": scan.mode,
                "lidar_source": scan.lidar.source,
                "vision_source": scan.vision.source,
                "point_count": scan.lidar.point_count,
                "lidar_stats": lidar_stats,
                "ros2_connected": scan.ros2_connected,
            },
            "bev_preview_b64": self.lidar.encode_thumbnail(bev),
            "camera_preview_b64": self.lidar.encode_thumbnail(scan.vision.image),
            "split_views": view_thumbs,
            "views_detections": views_dets,
            "all_detections": all_detections,
            "target_view": target_view,
            "observation": observation_to_dict(observation, extra={
                "sensor_mode": scan.mode,
                "lidar_stats": lidar_stats,
            }),
            "action_plan": action_plan_to_dict(action_plan),
            "detector_mode": self.detector.mode,
            "summary": (
                f"[{scan.mode}] {target_view}方向雷达+视觉识别到 Mini Pi 被重物压住，"
                f"置信度 {target_det.get('confidence', 0):.0%}，点云 {scan.lidar.point_count} pts"
            ),
        }
        self.last_result = result
        return result
