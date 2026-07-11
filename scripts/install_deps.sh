#!/usr/bin/env bash
# 最小依赖 — 仅 FastAPI，用于 UI 预览（秒级安装）
set -e
cd "$(dirname "$0")/.."

echo "⬡ 安装 NexTwin UI 依赖（FastAPI only）..."

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

python3 -m pip install --upgrade pip -q
pip3 install -r requirements.txt -q

echo "✓ UI 依赖安装完成"
python3 -c "import fastapi, uvicorn; print('  FastAPI', fastapi.__version__)"
