"""Billing plans and pay-per-use pricing for NexTwin API."""

from __future__ import annotations

from typing import Any

MONTHLY_PLANS: list[dict[str, Any]] = [
    {
        "id": "free",
        "name": "免费版",
        "price": 0,
        "unit": "month",
        "currency": "CNY",
        "highlight": False,
        "quota": {"task": 100, "execute": 10, "sensor_scan": 50, "camera_preview": 500, "ws_minutes": 60},
        "features": ["社区支持", "标准并发 5", "基础 API 文档"],
    },
    {
        "id": "developer",
        "name": "开发者版",
        "price": 99,
        "unit": "month",
        "currency": "CNY",
        "highlight": True,
        "quota": {"task": 5000, "execute": 500, "sensor_scan": 2000, "camera_preview": 10000, "ws_minutes": 3000},
        "features": ["邮件支持", "并发 50", "Webhook 回调", "用量报表"],
    },
    {
        "id": "pro",
        "name": "专业版",
        "price": 299,
        "unit": "month",
        "currency": "CNY",
        "highlight": False,
        "quota": {"task": 20000, "execute": 2000, "sensor_scan": 10000, "camera_preview": 50000, "ws_minutes": 15000},
        "features": ["优先队列", "并发 200", "专属 SDK 通道", "7×12 技术支持"],
    },
    {
        "id": "enterprise",
        "name": "企业版",
        "price": 999,
        "unit": "month",
        "currency": "CNY",
        "highlight": False,
        "quota": {"task": -1, "execute": -1, "sensor_scan": -1, "camera_preview": -1, "ws_minutes": -1},
        "features": ["SLA 99.9%", "无限并发", "私有化部署", "专属客户经理"],
    },
]

PAY_PER_USE: list[dict[str, Any]] = [
    {
        "id": "task",
        "endpoint": "POST /api/v1/task",
        "name": "任务解析",
        "description": "自然语言 → 10 步执行蓝图",
        "unit": "次",
        "price": 0.02,
        "currency": "CNY",
    },
    {
        "id": "execute",
        "endpoint": "POST /api/v1/execute",
        "name": "执行流水线",
        "description": "启动完整救援 / 巡检执行",
        "unit": "次",
        "price": 0.15,
        "currency": "CNY",
    },
    {
        "id": "sensor_scan",
        "endpoint": "POST /api/v1/sensor/scan",
        "name": "RTV 感知扫描",
        "description": "YOLO + 规则引擎完整分析",
        "unit": "次",
        "price": 0.08,
        "currency": "CNY",
    },
    {
        "id": "camera_preview",
        "endpoint": "GET /api/v1/camera/preview",
        "name": "相机预览帧",
        "description": "G1 onboard 相机 + 四向切分",
        "unit": "次",
        "price": 0.005,
        "currency": "CNY",
    },
    {
        "id": "world_load",
        "endpoint": "GET /api/v1/world",
        "name": "世界模型加载",
        "description": "加载场景快照与对象状态",
        "unit": "次",
        "price": 0.03,
        "currency": "CNY",
    },
    {
        "id": "ws",
        "endpoint": "WebSocket /ws",
        "name": "实时推送",
        "description": "任务状态 / 感知事件流",
        "unit": "分钟",
        "price": 0.01,
        "currency": "CNY",
    },
]


def get_plans() -> dict[str, Any]:
    return {
        "billing_modes": ["monthly", "pay_per_use"],
        "monthly_plans": MONTHLY_PLANS,
        "pay_per_use": PAY_PER_USE,
        "deduction_rules": [
            "费用 = 调用次数 × 单价，从账户余额实时扣减",
            "包月套餐优先消耗套餐内配额，超出部分按按次单价计费",
            "余额不足时 API 返回 402 Payment Required",
            "赠送余额优先于充值余额使用",
        ],
    }


def get_usage_mock() -> dict[str, Any]:
    return {
        "balance": 128.50,
        "granted_balance": 20.00,
        "currency": "CNY",
        "current_plan": "developer",
        "billing_mode": "monthly",
        "period": "2026-07",
        "usage": {
            "task": {"used": 1247, "quota": 5000},
            "execute": {"used": 89, "quota": 500},
            "sensor_scan": {"used": 412, "quota": 2000},
            "camera_preview": {"used": 3821, "quota": 10000},
            "ws_minutes": {"used": 680, "quota": 3000},
        },
        "recent_charges": [
            {"time": "2026-07-11T19:42:00+08:00", "api": "POST /api/v1/task", "amount": 0.02},
            {"time": "2026-07-11T19:38:00+08:00", "api": "POST /api/v1/sensor/scan", "amount": 0.08},
            {"time": "2026-07-11T19:35:00+08:00", "api": "POST /api/v1/execute", "amount": 0.15},
        ],
    }
