"""Phase 2 — earthquake world model: structural risk + push feasibility."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from nextwin.evacuation.models import NoGoZone, PerimeterMap, RiskCell, SceneContext, TaskContext

logger = logging.getLogger(__name__)


class ObstacleWorldModelEngine(ABC):
    @abstractmethod
    def simulate_perimeter(self, task: TaskContext, scene: SceneContext) -> PerimeterMap:
        ...


class MockObstacleWorldModelEngine(ObstacleWorldModelEngine):
    GRID = 8

    def simulate_perimeter(self, task: TaskContext, scene: SceneContext) -> PerimeterMap:
        logger.info("[ObstacleWorldModel] earthquake scene stability sim risk=%.2f", scene.initial_risk_level)

        box_x, box_y = 3, 4
        risk_grid: list[RiskCell] = []
        for y in range(self.GRID):
            for x in range(self.GRID):
                dist_box = ((x - box_x) ** 2 + (y - box_y) ** 2) ** 0.5
                dist_edge = min(x, y, self.GRID - 1 - x, self.GRID - 1 - y)
                structural = max(0.08, 0.55 - dist_edge * 0.06)
                if dist_box < 1.2:
                    structural = min(1.0, structural + 0.45)
                if dist_box < 2.0:
                    structural = min(1.0, structural + 0.15)
                is_no_go = structural >= 0.78 or dist_box < 0.8
                risk_grid.append(
                    RiskCell(x=x, y=y, risk=round(structural, 3), is_no_go=is_no_go)
                )

        no_go = [
            NoGoZone(
                zone_id="box_contact_zone",
                label="纸箱接触区（不可踩踏）",
                cells=[(box_x + dx, box_y + dy) for dx in (-1, 0) for dy in (-1, 0, 1)],
                reason="长方体障碍物与被困机器人接触，需从侧向施力",
            )
        ]

        safe_push = sorted(
            [c for c in risk_grid if not c.is_no_go and 1.5 < ((c.x - box_x) ** 2 + (c.y - box_y) ** 2) ** 0.5 < 3.5],
            key=lambda c: c.risk,
        )
        min_safe = min((c.risk for c in safe_push), default=0.3)

        predictions = {
            "aftershock_prob": 0.22,
            "debris_shift_risk": 0.18,
            "recommended_push_vector": "south_west",
            "safe_push_force_n": 65,
            "horizon_sec": 90,
        }

        return PerimeterMap(
            grid_width=self.GRID,
            grid_height=self.GRID,
            risk_grid=risk_grid,
            no_go_zones=no_go,
            safe_boundary=[{"x": c.x, "y": c.y, "risk": c.risk} for c in safe_push[:10]],
            predictions=predictions,
            world_model_version="earthquake-debris-v1",
            min_safe_risk=min_safe,
        )
