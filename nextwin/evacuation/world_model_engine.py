"""Phase 2 — world model engine (ABC + mock)."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from nextwin.evacuation.models import NoGoZone, PerimeterMap, RiskCell, SceneContext, TaskContext

logger = logging.getLogger(__name__)


class WorldModelEngine(ABC):
    """Predict environment dynamics and derive perimeter / risk grids."""

    @abstractmethod
    def simulate_perimeter(
        self, task: TaskContext, scene: SceneContext
    ) -> PerimeterMap:
        ...


class MockWorldModelEngine(WorldModelEngine):
    """Stub world model with logged mock predictions."""

    GRID = 8

    def simulate_perimeter(self, task: TaskContext, scene: SceneContext) -> PerimeterMap:
        logger.info(
            "[MockWorldModel] simulating hazard=%s layout=%s risk=%.2f",
            scene.hazard_type,
            scene.building_layout,
            scene.initial_risk_level,
        )

        hazard = scene.hazard_type
        origin_x, origin_y = 1, 1
        if task.locations and "厨房" in task.locations[0]:
            origin_x, origin_y = 2, 6

        risk_grid: list[RiskCell] = []
        for y in range(self.GRID):
            for x in range(self.GRID):
                dist = ((x - origin_x) ** 2 + (y - origin_y) ** 2) ** 0.5
                base = max(0.05, scene.initial_risk_level - dist * 0.08)
                if hazard == "fire" and dist < 2.5:
                    base = min(1.0, base + 0.35)
                if hazard == "smoke" and dist < 3.5:
                    base = min(1.0, base + 0.2)
                is_no_go = base >= 0.72
                risk_grid.append(RiskCell(x=x, y=y, risk=round(base, 3), is_no_go=is_no_go))

        no_go = [
            NoGoZone(
                zone_id="hazard_core",
                label="灾害核心区",
                cells=[(origin_x + dx, origin_y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)],
                reason=f"{hazard} intensity above safety threshold",
            )
        ]

        predictions = {
            "fire_spread_rate_m_per_min": 0.4 if hazard == "fire" else 0.0,
            "smoke_diffusion": "north_east" if "smoke" in task.hazard_types else "local",
            "collapse_risk": 0.15 if hazard == "collapse" else 0.05,
            "horizon_sec": 120,
        }

        safe_cells = [c for c in risk_grid if c.risk < 0.35]
        min_safe = min((c.risk for c in safe_cells), default=1.0)

        logger.info(
            "[MockWorldModel] no_go=%d safe_cells=%d min_safe_risk=%.3f",
            sum(1 for c in risk_grid if c.is_no_go),
            len(safe_cells),
            min_safe,
        )

        return PerimeterMap(
            grid_width=self.GRID,
            grid_height=self.GRID,
            risk_grid=risk_grid,
            no_go_zones=no_go,
            safe_boundary=[{"x": c.x, "y": c.y, "risk": c.risk} for c in safe_cells[:12]],
            predictions=predictions,
            world_model_version="mock-world-v1",
            min_safe_risk=min_safe,
        )
