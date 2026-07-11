"""Mock Unitree LiDAR + Vision for demo without hardware."""

from __future__ import annotations

import time

import numpy as np

from nextwin.devices.unitree_bridge import LidarFrame, SensorScan, VisionFrame


class MockUnitreeSensor:
    @staticmethod
    def generate_scan() -> SensorScan:
        points = MockUnitreeSensor._generate_lidar_points()
        image = MockUnitreeSensor._generate_vision_frame()
        return SensorScan(
            lidar=LidarFrame(
                points=points,
                timestamp=time.time(),
                source="g1_livox_mid360_mock",
                point_count=len(points),
            ),
            vision=VisionFrame(
                image=image,
                timestamp=time.time(),
                source="g1_realsense_d435i_mock",
                width=image.shape[1],
                height=image.shape[0],
            ),
            mode="mock",
            ros2_connected=False,
            metadata={"note": "G1 Livox Mid360 + D435i 模拟数据。真机: UNITREE_SENSOR_MODE=ros2"},
        )

    @staticmethod
    def _generate_lidar_points(n: int = 8000) -> np.ndarray:
        """Simulate UniLiDAR L2 point cloud with Mini Pi + debris cluster in front."""
        rng = np.random.default_rng(42)
        points = []

        # Ground plane
        for _ in range(n // 2):
            x = rng.uniform(-5, 5)
            y = rng.uniform(-5, 5)
            points.append([x, y, rng.uniform(-0.05, 0.05)])

        # Mini Pi cluster (front-left, ~2m)
        for _ in range(n // 6):
            points.append([
                rng.uniform(-2.8, -2.2),
                rng.uniform(0.8, 1.4),
                rng.uniform(0.05, 0.35),
            ])

        # Heavy debris on top
        for _ in range(n // 6):
            points.append([
                rng.uniform(-3.0, -2.0),
                rng.uniform(0.5, 1.6),
                rng.uniform(0.3, 0.8),
            ])

        # Walls
        for _ in range(n // 6):
            side = rng.choice(["front", "left", "right"])
            if side == "front":
                points.append([rng.uniform(-4, 0), rng.uniform(2.5, 3.5), rng.uniform(0, 1.5)])
            elif side == "left":
                points.append([rng.uniform(-4.5, -3.5), rng.uniform(-2, 2), rng.uniform(0, 1.5)])
            else:
                points.append([rng.uniform(1.5, 2.5), rng.uniform(-2, 2), rng.uniform(0, 1.5)])

        return np.array(points, dtype=np.float32)

    @staticmethod
    def _generate_vision_frame(w: int = 1280, h: int = 720) -> np.ndarray:
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:, :] = [40, 50, 65]
        img[int(h * 0.55) :, :] = [55, 60, 50]

        # Mini Pi (orange box) front-center
        cx, cy = w // 2 - 80, int(h * 0.55)
        img[cy : cy + 80, cx : cx + 60] = [220, 140, 60]
        # Heavy object (gray)
        img[cy - 50 : cy + 20, cx - 30 : cx + 90] = [90, 90, 95]

        return img
