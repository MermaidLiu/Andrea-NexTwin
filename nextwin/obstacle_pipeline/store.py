"""Session store for obstacle workflow."""

from __future__ import annotations

from nextwin.obstacle_pipeline.workflow import ObstacleWorkflow


class ObstacleSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, ObstacleWorkflow] = {}

    def create(self, workflow: ObstacleWorkflow) -> str:
        state = workflow.state
        if state is None:
            raise ValueError("Workflow has no state")
        self._sessions[state.session_id] = workflow
        return state.session_id

    def get(self, session_id: str) -> ObstacleWorkflow | None:
        return self._sessions.get(session_id)


obstacle_store = ObstacleSessionStore()
