#!/usr/bin/env bash
# 可选 — G1 视觉感知（numpy + OpenCV）
set -e
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
[ -d ".venv" ] || { python3 -m venv .venv; }
source .venv/bin/activate

echo "⬡ 安装视觉感知依赖..."
pip3 install -r requirements-vision.txt --only-binary :all: 2>/dev/null \
  || pip3 install -r requirements-vision.txt

echo "✓ 视觉依赖安装完成"
python3 -c "import cv2, numpy; print('  cv2', cv2.__version__, '| numpy', numpy.__version__)"
