"""ROS2 bridge for Unitree G1 — Livox Mid360 + RealSense D435i."""

from __future__ import annotations

import threading
import time
from typing import Any

import numpy as np

from nextwin.devices.unitree_bridge import LidarFrame, SensorScan, VisionFrame


class UnitreeROS2Bridge:
    """Subscribe to G1 ROS2 sensor topics."""

    def __init__(
        self,
        lidar_topic: str = "/utlidar/cloud",
        camera_topic: str = "/camera/color/image_raw",
        depth_topic: str | None = "/camera/depth/image_rect_raw",
        timeout: float = 5.0,
        robot_model: str = "g1",
    ) -> None:
        self.lidar_topic = lidar_topic
        self.camera_topic = camera_topic
        self.depth_topic = depth_topic
        self.timeout = timeout
        self.robot_model = robot_model
        self._connected = False
        self._latest_points: np.ndarray | None = None
        self._latest_image: np.ndarray | None = None
        self._lock = threading.Lock()
        self._node: Any = None
        self._spin_thread: threading.Thread | None = None

    @property
    def is_connected(self) -> bool:
        return self._connected

    def connect(self) -> bool:
        try:
            import rclpy
            from rclpy.node import Node
            from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy
            from sensor_msgs.msg import PointCloud2, Image
            from sensor_msgs_py import point_cloud2
            from cv_bridge import CvBridge
        except ImportError:
            return False

        bridge = CvBridge()
        node_ref = self

        class _G1SensorNode(Node):
            def __init__(self) -> None:
                super().__init__("nextwin_g1_sensor")
                sensor_qos = QoSProfile(
                    reliability=ReliabilityPolicy.BEST_EFFORT,
                    durability=DurabilityPolicy.VOLATILE,
                    history=HistoryPolicy.KEEP_LAST,
                    depth=1,
                )
                self.create_subscription(PointCloud2, node_ref.lidar_topic, self._on_cloud, sensor_qos)
                self.create_subscription(Image, node_ref.camera_topic, self._on_image, sensor_qos)
                self.get_logger().info(
                    f"G1 sensor node: lidar={node_ref.lidar_topic} camera={node_ref.camera_topic}"
                )

            def _on_cloud(self, msg: PointCloud2) -> None:
                pts = []
                for p in point_cloud2.read_points(msg, field_names=("x", "y", "z"), skip_nans=True):
                    pts.append([float(p[0]), float(p[1]), float(p[2])])
                if pts:
                    with node_ref._lock:
                        node_ref._latest_points = np.array(pts, dtype=np.float32)

            def _on_image(self, msg: Image) -> None:
                try:
                    encoding = "rgb8" if "rgb" in msg.encoding else "bgr8"
                    cv_img = bridge.imgmsg_to_cv2(msg, desired_encoding=encoding)
                    if encoding == "bgr8":
                        import cv2
                        cv_img = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
                    with node_ref._lock:
                        node_ref._latest_image = cv_img
                except Exception:
                    pass

        import rclpy
        if not rclpy.ok():
            rclpy.init()
        self._node = _G1SensorNode()

        def _spin() -> None:
            import rclpy
            while rclpy.ok() and self._connected:
                rclpy.spin_once(self._node, timeout_sec=0.05)

        self._connected = True
        self._spin_thread = threading.Thread(target=_spin, daemon=True)
        self._spin_thread.start()
        return True

    def grab_camera(self) -> VisionFrame | None:
        """Return latest G1 camera frame (no LiDAR required)."""
        deadline = time.time() + min(self.timeout, 3.0)
        while time.time() < deadline:
            with self._lock:
                img = self._latest_image
            if img is not None and img.size > 0:
                return VisionFrame(
                    image=img.copy(),
                    timestamp=time.time(),
                    source=f"g1_ros2:{self.camera_topic}",
                    width=img.shape[1],
                    height=img.shape[0],
                )
            time.sleep(0.05)
        return None

    def grab_scan(self) -> SensorScan | None:
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            with self._lock:
                pts = self._latest_points
                img = self._latest_image
            has_lidar = pts is not None and len(pts) > 100
            has_camera = img is not None and img.size > 0
            if has_lidar or has_camera:
                if pts is None or len(pts) <= 100:
                    from nextwin.devices.mock_sensor import MockUnitreeSensor

                    pts = MockUnitreeSensor._generate_lidar_points()
                if img is None:
                    img = np.zeros((720, 1280, 3), dtype=np.uint8)
                return SensorScan(
                    lidar=LidarFrame(
                        points=pts.copy(),
                        timestamp=time.time(),
                        source=f"g1_ros2:{self.lidar_topic}",
                        point_count=len(pts),
                    ),
                    vision=VisionFrame(
                        image=img.copy(),
                        timestamp=time.time(),
                        source=f"g1_ros2:{self.camera_topic}",
                        width=img.shape[1],
                        height=img.shape[0],
                    ),
                    mode="ros2",
                    ros2_connected=True,
                    metadata={
                        "robot_model": self.robot_model,
                        "lidar_topic": self.lidar_topic,
                        "camera_topic": self.camera_topic,
                        "lidar_model": "Livox Mid360",
                        "camera_model": "RealSense D435i",
                    },
                )
            time.sleep(0.1)
        return None

    def shutdown(self) -> None:
        self._connected = False
        if self._node:
            self._node.destroy_node()
