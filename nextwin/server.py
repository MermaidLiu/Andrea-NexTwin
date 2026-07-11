"""NexTwin Studio — FastAPI server."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from nextwin import __version__
from nextwin.config import RESCUE_DEFAULT_INSTRUCTION, WEB_DIR
from nextwin.executor import RescueExecutor
from nextwin.models import ExecuteRequest, SystemStatus, TaskRequest, TaskResponse
from nextwin.rtv.pipeline import RTVPipeline
from nextwin.task_parser import new_task_id, parse_instruction
from nextwin.world_model import WorldModel

world = WorldModel()
rtv = RTVPipeline()
executor = RescueExecutor(world, rtv)
ws_clients: set[WebSocket] = set()
current_task_id: str | None = None


async def broadcast(message: dict[str, Any]) -> None:
    payload = json.dumps(message, ensure_ascii=False, default=str)
    dead: list[WebSocket] = []
    for ws in ws_clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    executor.cancel()


app = FastAPI(
    title="NexTwin Rescue",
    description="具身智能无人救援 — RTV + YOLO + 规则引擎",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/v1/status", response_model=SystemStatus)
async def get_status():
    return SystemStatus(
        status=world.state.status,
        message=world.state.message,
        components={
            "robot": {"status": "G1", "model": "Unitree G1"},
            "lidar": {
                "status": rtv.sensor.status.get("ros2", "mock"),
                "model": "Livox Mid360",
                "topic": rtv.sensor.status.get("lidar_topic", "/utlidar/cloud"),
            },
            "vision": {
                "status": "ready",
                "model": "RealSense D435i",
                "topic": rtv.sensor.status.get("camera_topic", "/camera/color/image_raw"),
            },
            "rtv": {"status": "ready", **rtv.status},
            "rule_engine": {"status": "ready", "version": "v1.0"},
            "g1_control": executor.g1.status,
        },
    )


@app.get("/api/v1/demo/default")
async def get_default():
    return {"instruction": RESCUE_DEFAULT_INSTRUCTION}


@app.post("/api/v1/task", response_model=TaskResponse)
async def create_task(req: TaskRequest):
    global current_task_id
    blueprint, mode = await parse_instruction(req.instruction)
    current_task_id = new_task_id()
    world.load_blueprint(blueprint)
    await broadcast({"type": "task_created", "task_id": current_task_id, "state": world.snapshot().model_dump()})
    return TaskResponse(task_id=current_task_id, blueprint=blueprint, world_model=world.snapshot())


@app.post("/api/v1/execute")
async def execute_task(req: ExecuteRequest | None = None):
    if executor.is_running:
        return {"error": "already running"}
    if not world.state.blueprint:
        blueprint, _ = await parse_instruction(RESCUE_DEFAULT_INSTRUCTION)
        world.load_blueprint(blueprint)

    async def _run():
        await executor.run(world.state.blueprint, broadcast)

    asyncio.create_task(_run())
    return {"status": "started", "task_id": current_task_id}


@app.post("/api/v1/execute/cancel")
async def cancel():
    executor.cancel()
    return {"status": "cancelling"}


@app.get("/api/v1/sensor/status")
async def sensor_status():
    return rtv.sensor.status


@app.post("/api/v1/sensor/scan")
async def sensor_scan():
    result = rtv.run_full_analysis()
    world.apply_rtv_result(result)
    await broadcast({"type": "sensor_ready", "sensor": result.get("sensor"), "state": world.snapshot().model_dump()})
    return result


@app.get("/api/v1/world")
async def get_world():
    return world.snapshot()


@app.get("/api/v1/observation")
async def get_observation():
    obs = world.state.observation
    return obs.model_dump() if obs else {}


@app.get("/api/v1/action-plan")
async def get_action_plan():
    plan = world.state.action_plan
    if not plan:
        return {}
    return {
        "rule_version": plan.rule_version,
        "actions": [a.model_dump() for a in plan.actions],
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    try:
        await ws.send_text(json.dumps({"type": "connected", "state": world.snapshot().model_dump()}, default=str))
        while True:
            msg = json.loads(await ws.receive_text())
            if msg.get("action") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)


@app.get("/")
async def index():
    return FileResponse(WEB_DIR / "index.html")


if Path(WEB_DIR).exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


def main():
    import uvicorn
    from nextwin.config import HOST, PORT
    uvicorn.run("nextwin.server:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
