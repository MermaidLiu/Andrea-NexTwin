#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
G1机器人：单臂张开扒开障碍物（使用高级动作API）
"""

import time
from unitree_sdk2py.core.channel import ChannelFactoryInitialize
from unitree_sdk2py.g1.loco.g1_loco_client import LocoClient
from unitree_sdk2py.g1.arm.g1_arm_action_client import G1ArmActionClient


class G1ObstacleClearer:
    def __init__(self, interface="eth0"):
        ChannelFactoryInitialize(0, interface)

        self.loco = LocoClient()
        self.loco.Init()

        self.arm = G1ArmActionClient()
        self.arm.Init()

    def clear_obstacle(self):
        """单臂张开扒开障碍物"""
        print("🦾 右臂张开，准备扒开障碍物...")

        # Step 1: 右手平举/张开 (ID: 23)
        ret = self.arm.ExecuteAction(23)
        if ret != 0:
            print(f"⚠️ 手臂动作失败: {ret}")
            return

        time.sleep(1.5)

        # Step 2: 手臂横向摆动模拟"扒开"动作
        # 可以通过多次执行不同动作组合来实现
        # 或者使用低级API精确控制摆动轨迹

        # Step 3: 恢复手臂初始位姿
        print("🔄 恢复手臂...")
        self.arm.ExecuteAction(99)

    def execute(self):
        """完整任务"""
        # 站立
        print("🦿 机器人站立...")
        self.loco.Lie2StandUp()
        time.sleep(3.0)

        # 走到障碍物前（略）
        # ...

        # 单臂张开扒开障碍物
        self.clear_obstacle()

        print("✅ 任务完成")


if __name__ == "__main__":
    robot = G1ObstacleClearer()
    robot.execute()
