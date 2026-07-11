#!/usr/bin/env bash
# 应急救援逃生工作流 — 端到端 Demo
set -euo pipefail
cd "$(dirname "$0")/.."
python -m nextwin.evacuation.main "$@"
