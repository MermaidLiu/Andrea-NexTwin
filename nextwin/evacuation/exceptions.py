"""Evacuation workflow exceptions."""


class EvacuationWorkflowError(Exception):
    """Base error for evacuation pipeline."""


class SafeRouteNotFoundException(EvacuationWorkflowError):
    """No safe evacuation route could be derived from world model + agent."""

    def __init__(self, message: str, fallback_protocol: str = "shelter_in_place") -> None:
        super().__init__(message)
        self.fallback_protocol = fallback_protocol


class WorkflowStateError(EvacuationWorkflowError):
    """Invalid workflow transition or missing context."""
