#!/usr/bin/env bash
# NexTwin Studio — G1 真机 + YOLO
set -e
cd "$(dirname "$0")/.."

echo "⬡ NexTwin Studio 启动中..."

if ! python3 -c "import cv2, fastapi, ultralytics" 2>/dev/null; then
  chmod +x scripts/install_deps.sh
  ./scripts/install_deps.sh
else
  # shellcheck disable=SC1091
  [ -d ".venv" ] && source .venv/bin/activate
  echo "→ 依赖已就绪，跳过安装"
fi

# shellcheck disable=SC1091
[ -d ".venv" ] && source .venv/bin/activate

export UNITREE_SENSOR_MODE="${UNITREE_SENSOR_MODE:-ros2}"
export NEXTWIN_ENABLE_YOLO="${NEXTWIN_ENABLE_YOLO:-1}"

if [ -f "$HOME/unitree_ros2/setup.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/unitree_ros2/setup.sh"
  echo "→ 已加载 unitree_ros2"
fi

echo "→ 传感器: G1 ROS2 ($UNITREE_SENSOR_MODE)"
echo "→ YOLO: ${NEXTWIN_ENABLE_YOLO:-1}"
echo "→ 服务地址: http://localhost:8080"
echo "→ 按 Ctrl+C 停止"
python3 -m nextwin
