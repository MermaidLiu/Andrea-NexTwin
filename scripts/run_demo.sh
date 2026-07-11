#!/usr/bin/env bash
# NexTwin Studio — G1 真机 + YOLO
set -e
cd "$(dirname "$0")/.."

echo "⬡ NexTwin Studio 启动中..."

if [ ! -d ".venv" ]; then
  echo "→ 创建虚拟环境..."
  python3 -m venv .venv
fi

source .venv/bin/activate

if ! python3 -c "import fastapi, ultralytics" 2>/dev/null; then
  echo "→ 安装依赖（含 YOLO，首次约 3-5 分钟）..."
  pip install -r requirements.txt
else
  echo "→ 依赖已就绪，跳过安装"
fi

# G1 onboard 相机 + 雷达（ROS2）
export UNITREE_SENSOR_MODE="${UNITREE_SENSOR_MODE:-ros2}"
export NEXTWIN_ENABLE_YOLO="${NEXTWIN_ENABLE_YOLO:-1}"

# 若已安装 unitree_ros2，自动 source
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
