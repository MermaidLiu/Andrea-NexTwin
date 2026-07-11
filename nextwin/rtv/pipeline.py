"""RTV pipeline — G1 LiDAR + Camera → 4-view → YOLO → observation."""

from __future__ import annotations

from typing import Any

from nextwin.devices.unitree_bridge import UnitreeSensorBridge
from nextwin.observation import build_observation, observation_to_dict
from nextwin.perception import YOLODetector
from nextwin.rtv.lidar_processor import LidarProcessor
from nextwin.rule_engine import action_plan_to_dict, plan_actions
from nextwin.vision.pipeline import VisionPipeline


class RTVPipeline:
    """Layered pipeline:

    1. sensor   — G1 Livox + RealSense (ROS2 / SDK2 / mock)
    2. vision   — 4-view split from G1 camera frame
    3. perception — YOLO on each view (enabled by default)
    4. control  — RescueExecutor / G1Controller (separate module)
    """

    def __init__(self) -> None:
        self.sensor = UnitreeSensorBridge()
        self.vision = VisionPipeline()
        self.lidar = LidarProcessor()
        self.detector = YOLODetector()
        self.last_result: dict[str, Any] = {}

    @property
    def status(self) -> dict[str, str]:
        return {
            "engine": "RTV · G1 Livox Mid360 + RealSense D435i",
            "detector": self.detector.mode,
            "detector_model": self.detector.model_path,
            "sensor": self.sensor.status.get("mode", "mock"),
            "camera_topic": self.sensor.status.get("camera_topic", ""),
            "views": "4-way (front/back/left/right)",
            **self.detector.status,
        }

    def _split_views(self, scan) -> dict[str, Any]:
        """G1 camera → 4 views; LiDAR BEV merged into front when available."""
        camera_views = self.vision.split_views(scan.vision.image)
        if scan.mode in ("ros2", "sdk") and scan.lidar.point_count > 0:
            lidar_views = self.lidar.split_4_views(scan.lidar.points)
            return self.lidar.merge_with_vision(lidar_views, scan.vision.image)
        if scan.mode == "mock":
            lidar_views = self.lidar.split_4_views(scan.lidar.points)
            return self.lidar.merge_with_vision(lidar_views, scan.vision.image)
        return camera_views

    def run_full_analysis(self, scenario: str = "rescue") -> dict[str, Any]:
        self.detector.scenario = scenario
        scan = self.sensor.scan_with_retry()
        bev = self.lidar.bev_preview(scan.lidar.points)
        lidar_stats = self.lidar.lidar_stats(scan.lidar.points)
        views_img = self._split_views(scan)
        view_thumbs = {name: self.lidar.encode_thumbnail(img) for name, img in views_img.items()}

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

        # mock 补全：按场景注入演示检测
        if self.detector.mode == "mock":
            need_mock = (
                scenario == "obstacle"
                and not any(d.get("class") == "obstacle_box" for d in all_detections)
            ) or (
                scenario == "rescue"
                and not any(d.get("class") == "mini_pi" for d in all_detections)
            )
            if need_mock:
                front_img = views_img["front"]
                mock = self.detector._detect_mock(front_img, scenario)
                for d in mock:
                    d["view"] = "front"
                    d["scene_position"] = self.lidar.bbox_to_scene_position(
                        "front", d["bbox"], front_img.shape[1], front_img.shape[0]
                    )
                views_dets["front"] = mock
                all_detections = [d for d in all_detections if d.get("view") != "front"]
                all_detections.extend(mock)

        target_view, target_det = self.detector.find_target(all_detections, scenario)
        if target_det is None:
            if scenario == "obstacle":
                target_det = {
                    "class": "obstacle_box",
                    "label": "长方体障碍物",
                    "confidence": 0.0,
                    "bbox": [200, 280, 440, 520],
                    "scene_position": [-2.0, 0.25, -1.5],
                }
            else:
                target_det = {
                    "class": "mini_pi",
                    "label": "Mini Pi (被压)",
                    "confidence": 0.0,
                    "bbox": [200, 250, 440, 520],
                    "scene_position": [-2.5, 0.15, -1.8],
                }

        observation = build_observation(
            views_dets,
            target_view,
            target_det,
            self.detector.mode,
            sensor_source="unitree_g1_lidar_vision",
            lidar_stats=lidar_stats,
            sensor_mode=scan.mode,
            scenario=scenario,
        )
        action_plan = plan_actions(observation, scenario)

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
            "observation": observation_to_dict(
                observation,
                extra={
                    "sensor_mode": scan.mode,
                    "lidar_stats": lidar_stats,
                    "vision_source": scan.vision.source,
                    "detector": self.detector.mode,
                },
            ),
            "action_plan": action_plan_to_dict(action_plan),
            "detector_mode": self.detector.mode,
            "summary": (
                f"[G1/{scan.mode}] YOLO({self.detector.mode}) "
                f"{target_view}方向识别 {target_det.get('label', '目标')}，"
                f"置信度 {target_det.get('confidence', 0):.0%}，"
                f"场景 {scenario}，点云 {scan.lidar.point_count} pts"
            ),
        }
        self.last_result = result
        return result

    def capture_camera_preview(self) -> dict[str, Any]:
        """Live G1 RealSense preview + 4-view split."""
        vf = self.sensor.grab_camera_frame()
        if vf is None:
            scan = self.sensor.scan()
            vf = scan.vision
            source = scan.vision.source
        else:
            source = vf.source
        return self.vision.run_from_frame(vf.image, source=source)

    def release(self) -> None:
        self.vision.release()
        self.sensor.release()
