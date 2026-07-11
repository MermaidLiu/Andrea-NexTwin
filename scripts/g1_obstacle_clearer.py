#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
G1机器人：视觉检测障碍物 → 走近 → 用单臂扒开障碍物
"""

import time
import cv2
import torch
from unitree_sdk2py.core.channel import ChannelFactoryInitialize
from unitree_sdk2py.g1.loco.g1_loco_client import LocoClient
from unitree_sdk2py.g1.arm.g1_arm_action_client import G1ArmActionClient
from unitree_sdk2py.go2.video.video_client import VideoClient


class G1ObstacleClearer:
    def __init__(self, network_interface="eth0"):
        ChannelFactoryInitialize(0, network_interface)
        
        self.loco_client = LocoClient()
        self.loco_client.Init()
        
        self.arm_client = G1ArmActionClient()
        self.arm_client.Init()
        
        # 加载YOLO模型用于障碍物检测[reference:15]
        self.model = torch.hub.load('ultralytics/yolov5', 'yolov5s')
        
        print("✅ G1机器人初始化完成")
    
    def detect_obstacle(self):
        """
        使用摄像头检测前方是否有障碍物
        返回: (has_obstacle, distance_estimate)
        """
        # 获取图像帧（具体API根据SDK版本调整）
        # frame = self.video_client.GetImage()
        
        # 使用YOLO检测
        # results = self.model(frame)
        # 解析检测结果，判断是否有障碍物在路径上
        
        # 示例：模拟检测到障碍物
        print("🔍 检测到前方有障碍物")
        return True, 1.5  # (有障碍物, 距离约1.5米)
    
    def walk_to_obstacle(self, distance=1.5):
        """走向障碍物"""
        print(f"🚶 走向障碍物 (距离: {distance}m)")
        # 根据距离计算行走时间
        walk_time = distance / 0.3  # 速度0.3m/s
        self.loco_client.Move(0.3, 0.0, 0.0)
        time.sleep(walk_time)
        self.loco_client.Move(0.0, 0.0, 0.0)
        print("✅ 到达障碍物前")
    
    def push_obstacle_with_arm(self):
        """
        用单臂扒开障碍物
        使用低等级控制(LowCmd)控制手臂关节
        """
        print("🦾 伸出右臂扒开障碍物...")
        
        # TODO: 使用LowCmd_设置手臂各关节目标角度
        # G1单臂5~7个自由度，需要设置每个关节的角度[reference:16]
        # from unitree_sdk2py.core.dds.low_cmd import LowCmd_
        # low_cmd = LowCmd_()
        # low_cmd.motor_cmd[手臂关节索引].q = 目标角度
        # low_cmd.motor_cmd[手臂关节索引].dq = 目标速度
        # low_cmd.motor_cmd[手臂关节索引].kp = 刚度
        # low_cmd.motor_cmd[手臂关节索引].kd = 阻尼
        
        # 示例：执行一个"扒开"的动作序列
        # 1. 手臂向前伸出
        # 2. 手臂横向摆动（扒开动作）
        # 3. 手臂收回
        
        time.sleep(2.0)
        print("✅ 障碍物已被扒开")
    
    def execute(self):
        """执行完整任务"""
        print("\n🎯 开始执行：检测障碍物 → 走近 → 扒开\n")
        
        # Step 1: 机器人站立
        print("🦿 机器人站立...")
        self.loco_client.Lie2StandUp()
        time.sleep(3.0)
        
        # Step 2: 检测障碍物
        has_obstacle, distance = self.detect_obstacle()
        if not has_obstacle:
            print("✅ 前方无阻碍，任务完成")
            return
        
        # Step 3: 走向障碍物
        self.walk_to_obstacle(distance)
        
        # Step 4: 用单臂扒开障碍物
        self.push_obstacle_with_arm()
        
        print("\n✅ 任务完成！")


if __name__ == "__main__":
    robot = G1ObstacleClearer()
    robot.execute()