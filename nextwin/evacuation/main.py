#!/usr/bin/env python3
"""End-to-end demo for the emergency evacuation workflow."""

from __future__ import annotations

import argparse
import json
import logging
import sys

from nextwin.evacuation.exceptions import EvacuationWorkflowError
from nextwin.evacuation.workflow import EvacuationWorkflow

DEFAULT_INSTRUCTION = "厨房起火了，烟雾越来越大，请带我安全逃生。"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)


def _print_state(state) -> None:
    print("\n" + "=" * 60)
    print(f"Session: {state.session_id}")
    print(f"Phase:   {state.phase.value}")
    if state.fallback_protocol:
        print(f"Fallback: {state.fallback_protocol}")
    if state.output:
        print(f"\n最优路径 ({len(state.output.optimal_path.waypoints)} waypoints, "
              f"risk={state.output.optimal_path.total_risk}):")
        for wp in state.output.optimal_path.waypoints:
            print(f"  → ({wp.x}, {wp.z}) {wp.label}")
        print("\n解决方案:")
        for step in state.output.solution_steps:
            print(f"  • {step}")
        print(f"\n世界模型依据:\n  {state.output.world_model_rationale}")
    print("\n日志:")
    for line in state.logs[-8:]:
        print(f"  {line}")
    print("=" * 60)


def run_interactive(instruction: str, force_unsafe: bool = False) -> None:
    wf = EvacuationWorkflow(force_unsafe=force_unsafe)
    try:
        state = wf.start(instruction)
    except EvacuationWorkflowError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)

    _print_state(state)

    while state.phase.value == "awaiting_confirmation":
        answer = input("\n确认执行该方案? [Y/N]: ").strip().upper()
        if answer not in ("Y", "N"):
            print("请输入 Y 或 N")
            continue
        feedback = ""
        if answer == "N":
            feedback = input("修改意见 (可选): ").strip()
        state = wf.confirm(approved=(answer == "Y"), feedback=feedback)
        _print_state(state)

    print(f"\n最终状态: {state.phase.value}")
    if state.user_confirmed:
        print("✓ 方案已确认并执行（模拟完成）")
    elif state.fallback_protocol:
        print(f"⚠ 已启用备用协议: {state.fallback_protocol}")


def run_json(instruction: str, approve: bool, force_unsafe: bool = False) -> None:
    wf = EvacuationWorkflow(force_unsafe=force_unsafe)
    state = wf.start(instruction)
    if approve is not None:
        state = wf.confirm(approved=approve)
    print(json.dumps(state.model_dump(mode="json"), ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="应急救援逃生工作流 Demo")
    parser.add_argument("--instruction", "-i", default=DEFAULT_INSTRUCTION, help="自然语言指令")
    parser.add_argument("--json", action="store_true", help="JSON 输出模式")
    parser.add_argument("--approve", choices=["Y", "N"], help="JSON 模式下直接确认")
    parser.add_argument("--unsafe", action="store_true", help="强制触发掩体避险降级")
    args = parser.parse_args()

    approve = {"Y": True, "N": False}.get(args.approve) if args.approve else None

    if args.json:
        run_json(args.instruction, approve, force_unsafe=args.unsafe)
    else:
        run_interactive(args.instruction, force_unsafe=args.unsafe)


if __name__ == "__main__":
    main()
