"""In-memory session store for evacuation workflows."""

from __future__ import annotations

from nextwin.evacuation.workflow import EvacuationWorkflow


class EvacuationSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, EvacuationWorkflow] = {}

    def create(self, workflow: EvacuationWorkflow) -> str:
        state = workflow.state
        if state is None:
            raise ValueError("Workflow has no state")
        self._sessions[state.session_id] = workflow
        return state.session_id

    def get(self, session_id: str) -> EvacuationWorkflow | None:
        return self._sessions.get(session_id)

    def delete(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    def list_ids(self) -> list[str]:
        return list(self._sessions.keys())


evacuation_store = EvacuationSessionStore()
