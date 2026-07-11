#!/usr/bin/env bash
# NexTwin Studio — UI 优先，最小依赖
set -e
cd "$(dirname "$0")/.."

echo "⬡ NexTwin Studio 启动中..."

if ! python3 -c "import fastapi" 2>/dev/null; then
  chmod +x scripts/install_deps.sh
  ./scripts/install_deps.sh
else
  # shellcheck disable=SC1091
  [ -d ".venv" ] && source .venv/bin/activate
  echo "→ 依赖已就绪"
fi

# shellcheck disable=SC1091
[ -d ".venv" ] && source .venv/bin/activate

# UI 模式默认 mock；有视觉库时自动切换 full 模式
export UNITREE_SENSOR_MODE="${UNITREE_SENSOR_MODE:-mock}"
export NEXTWIN_ENABLE_YOLO="${NEXTWIN_ENABLE_YOLO:-0}"

if [ -f "$HOME/unitree_ros2/setup.sh" ] && python3 -c "import numpy" 2>/dev/null; then
  # shellcheck disable=SC1091
  source "$HOME/unitree_ros2/setup.sh"
  export UNITREE_SENSOR_MODE="${UNITREE_SENSOR_MODE:-ros2}"
  export NEXTWIN_ENABLE_YOLO="${NEXTWIN_ENABLE_YOLO:-1}"
  echo "→ 已加载 unitree_ros2（完整感知模式）"
fi

MODE=$(python3 -c "from nextwin.runtime import vision_stack_available; print('full' if vision_stack_available() else 'ui')" 2>/dev/null || echo "ui")

echo "→ 运行模式: $MODE"
echo "→ 首页: http://localhost:8080"
echo "→ Studio: http://localhost:8080/studio"
echo "→ 按 Ctrl+C 停止"
python3 -m nextwin
