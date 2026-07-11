#!/usr/bin/env bash
# NexTwin Studio 一键启动脚本
set -e
cd "$(dirname "$0")/.."

echo "⬡ NexTwin Studio 启动中..."

if [ ! -d ".venv" ]; then
  echo "→ 创建虚拟环境..."
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -r requirements.txt -q

echo "→ 服务地址: http://localhost:8080"
echo "→ 按 Ctrl+C 停止"
python3 -m nextwin
