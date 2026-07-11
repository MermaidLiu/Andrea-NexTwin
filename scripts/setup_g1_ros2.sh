#!/usr/bin/env bash
# Unitree G1 ROS2 传感器环境配置
set -e

echo "⬡ Unitree G1 传感器接入"
echo "  LiDAR : Livox Mid360  → /utlidar/cloud"
echo "  Camera: RealSense D435i → /camera/color/image_raw"
echo ""

# 1. DDS 环境（必须）
if [ -f "$HOME/unitree_ros2/setup.sh" ]; then
  source "$HOME/unitree_ros2/setup.sh"
  echo "✓ unitree_ros2 DDS 已加载"
else
  echo "⚠ 未找到 ~/unitree_ros2/setup.sh"
  echo "  git clone https://github.com/unitreerobotics/unitree_ros2.git"
fi

# 2. ROS2
if [ -f "/opt/ros/humble/setup.bash" ]; then
  source /opt/ros/humble/setup.bash
elif [ -f "/opt/ros/foxy/setup.bash" ]; then
  source /opt/ros/foxy/setup.bash
fi

echo ""
echo "检查 G1 话题:"
ros2 topic list 2>/dev/null | grep -E "utlidar|camera|lowstate" || echo "  (未检测到，请确认 G1 已联网且 DDS 配置正确)"
echo ""
echo "启动 NexTwin:"
echo "  export UNITREE_SENSOR_MODE=ros2"
echo "  export UNITREE_ROBOT_MODEL=g1"
echo "  python3 -m nextwin"
