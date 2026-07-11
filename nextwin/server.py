"""NexTwin Studio — FastAPI server."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from nextwin import __version__
from nextwin.config import RESCUE_DEFAULT_INSTRUCTION, WEB_DIR
from nextwin.models import ExecuteRequest, SystemStatus, TaskRequest, TaskResponse
from nextwin.runtime import Runtime
from nextwin.task_parser import new_task_id, parse_instruction
from nextwin.world_model import WorldModel

world = WorldModel()
runtime = Runtime(world)
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
    runtime.release()


app = FastAPI(
    title="NexTwin Studio",
    description="具身智能数字孪生平台",
    version=__version__,
    lifespan=lifespan,
    docs_url="/api/swagger",
    redoc_url=None,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/v1/status", response_model=SystemStatus)
async def get_status():
    return SystemStatus(
        status=world.state.status,
        message=world.state.message or f"NexTwin Studio ({runtime.mode} 模式)",
        components=runtime.status_components,
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
    if runtime.executor.is_running:
        return {"error": "already running"}
    if not world.state.blueprint:
        blueprint, _ = await parse_instruction(RESCUE_DEFAULT_INSTRUCTION)
        world.load_blueprint(blueprint)

    async def _run():
        await runtime.executor.run(world.state.blueprint, broadcast)

    asyncio.create_task(_run())
    return {"status": "started", "task_id": current_task_id, "mode": runtime.mode}


@app.post("/api/v1/execute/cancel")
async def cancel():
    runtime.executor.cancel()
    return {"status": "cancelling"}


@app.get("/api/v1/sensor/status")
async def sensor_status():
    if runtime.rtv:
        return runtime.rtv.sensor.status
    return {"mode": "ui-only", "note": "安装 requirements-vision.txt 启用 G1 感知"}


@app.get("/api/v1/camera/preview")
async def camera_preview():
    if not runtime.rtv:
        return {"mode": "ui-only", "frame_b64": "", "split_views": {}, "note": "UI 模式，无相机数据"}
    data = runtime.rtv.capture_camera_preview()
    return {
        "source": data.get("camera_source"),
        "width": data.get("width"),
        "height": data.get("height"),
        "frame_b64": data.get("frame_b64"),
        "split_views": data.get("split_views"),
        "sensor_mode": runtime.rtv.sensor.mode,
        "detector": runtime.rtv.detector.status,
    }


@app.get("/api/v1/vision/status")
async def vision_status():
    if runtime.rtv:
        return {"vision": runtime.rtv.vision.status, "detector": runtime.rtv.detector.status, "sensor": runtime.rtv.sensor.status}
    return {"mode": "ui-only", "detector": {"mode": "ui-demo"}}


@app.post("/api/v1/sensor/scan")
async def sensor_scan():
    if not runtime.rtv:
        raise HTTPException(503, "感知模块未安装。运行: ./scripts/install_vision.sh")
    result = runtime.rtv.run_full_analysis()
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
    return {"rule_version": plan.rule_version, "actions": [a.model_dump() for a in plan.actions]}


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


@app.get("/api/v1/platform/stats")
async def platform_stats():
    return {"world_models": 12847, "sdk_packages": 36, "deploy_nodes": 892, "developers": 4200}


# ── Developer portal API ──

@app.get("/api/v1/developer/sdk/list")
async def dev_sdk_list():
    from nextwin.developer_store import list_sdk
    return list_sdk()


@app.post("/api/v1/developer/sdk/upload")
async def dev_sdk_upload(
    name: str = Form(...),
    version: str = Form(...),
    robot: str = Form("generic"),
    description: str = Form(""),
    file: UploadFile | None = File(None),
):
    from nextwin.developer_store import SDK_DIR, register_sdk, save_upload_file

    filename = None
    if file and file.filename:
        filename = await save_upload_file(file, SDK_DIR)
    return register_sdk(name, version, robot, description, filename)


@app.delete("/api/v1/developer/sdk/{sdk_id}")
async def dev_sdk_delete(sdk_id: str):
    from nextwin.developer_store import delete_sdk
    if not delete_sdk(sdk_id):
        raise HTTPException(404, "SDK not found")
    return {"status": "deleted"}


@app.get("/api/v1/developer/worldmodel/list")
async def dev_wm_list():
    from nextwin.developer_store import list_world_models
    return list_world_models()


@app.post("/api/v1/developer/worldmodel/upload")
async def dev_wm_upload(
    name: str = Form(...),
    publish_type: str = Form("platform"),
    scene: str = Form("通用"),
    fidelity: int = Form(85),
    physics: int = Form(88),
    description: str = Form(""),
    file: UploadFile | None = File(None),
):
    from nextwin.developer_store import WM_DIR, register_world_model, save_upload_file

    filename = None
    if file and file.filename:
        filename = await save_upload_file(file, WM_DIR)
    return register_world_model(name, publish_type, scene, fidelity, physics, description, filename)


@app.get("/")
async def index():
    return FileResponse(WEB_DIR / "index.html")


@app.get("/developer")
async def developer_page():
    return FileResponse(WEB_DIR / "developer.html")


@app.get("/workspace")
async def workspace():
    return FileResponse(WEB_DIR / "workspace.html")


@app.get("/studio")
async def studio():
    return FileResponse(WEB_DIR / "studio.html")


@app.get("/docs")
async def docs_page():
    return FileResponse(WEB_DIR / "docs.html")


if Path(WEB_DIR).exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


def main():
    import uvicorn
    from nextwin.config import HOST, PORT
    uvicorn.run("nextwin.server:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
