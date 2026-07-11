"""Unitree G1 sensor & control presets.

G1 onboard sensors (official):
  - LiDAR : Livox Mid360  →  /utlidar/cloud   (sensor_msgs/PointCloud2)
  - IMU   :               →  /utlidar/imu     (sensor_msgs/Imu)
  - Camera: RealSense D435i → /camera/color/image_raw
  - Depth : RealSense D435i → /camera/depth/image_rect_raw

References:
  - https://github.com/unitreerobotics/unitree_ros2
  - https://github.com/unitreerobotics/unitree_sdk2_python
"""

G1_PRESET = {
    "robot_model": "G1",
    "lidar_model": "Livox Mid360",
    "camera_model": "Intel RealSense D435i",
    "lidar_topic": "/utlidar/cloud",
    "lidar_frame": "utlidar_lidar",
    "imu_topic": "/utlidar/imu",
    "camera_topic": "/camera/color/image_raw",
    "depth_topic": "/camera/depth/image_rect_raw",
    "camera_info_topic": "/camera/color/camera_info",
    "lowstate_topic": "/lowstate",
    "wireless_controller_topic": "/wirelesscontroller",
    "sdk_repo": "https://github.com/unitreerobotics/unitree_ros2",
    "sdk2_python_repo": "https://github.com/unitreerobotics/unitree_sdk2_python",
}

G1_ROS2_SETUP = """
# G1 ROS2 传感器接入步骤（在 G1  onboard 或联网工控机 Ubuntu 22.04 + ROS2 Humble）

# 1. 配置 DDS（必须，否则看不到 G1 话题）
cd ~/unitree_ros2 && source setup.sh

# 2. 确认雷达话题
ros2 topic list | grep utlidar
# 期望: /utlidar/cloud  /utlidar/imu

# 3. 启动 RealSense D435i（如未随 bringup 启动）
ros2 launch realsense2_camera rs_launch.py \\
  depth_module.depth_profile:=1280x720x30 pointcloud.enable:=true

# 4. 确认相机话题
ros2 topic list | grep camera
# 期望: /camera/color/image_raw

# 5. 启动 NexTwin
export UNITREE_SENSOR_MODE=ros2
export UNITREE_ROBOT_MODEL=g1
python3 -m nextwin
"""
