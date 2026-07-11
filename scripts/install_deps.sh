#!/usr/bin/env bash
# 依赖安装 — macOS 友好，统一使用 python3 / pip3
set -e
cd "$(dirname "$0")/.."

echo "⬡ 安装 NexTwin 依赖..."

if [ ! -d ".venv" ]; then
  echo "→ 创建虚拟环境..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

PY=python3
PIP=pip3

echo "→ Python: $($PY --version)"
echo "→ 升级 pip..."
$PY -m pip install --upgrade pip setuptools wheel -q

echo "→ 安装 numpy / Pillow..."
$PIP install "numpy>=1.24.0,<2.0.0" "Pillow>=10.0.0" -q

echo "→ 安装 OpenCV（预编译 wheel，避免本地编译）..."
if ! $PIP install "opencv-python-headless==4.8.1.78" --only-binary :all: -q 2>/dev/null; then
  echo "  headless wheel 不可用，尝试 opencv-python 4.8.1.78 ..."
  if ! $PIP install "opencv-python==4.8.1.78" --only-binary :all: -q 2>/dev/null; then
    echo "  尝试不限制 binary 安装 headless ..."
    $PIP install "opencv-python-headless==4.8.1.78" -q
  fi
fi

echo "→ 安装其余依赖（FastAPI / YOLO 等，可能需要几分钟）..."
$PIP install -r requirements.txt -q

echo "✓ 依赖安装完成"
$PY -c "import cv2; import fastapi; import ultralytics; print('  cv2', cv2.__version__, '| ultralytics OK')"
