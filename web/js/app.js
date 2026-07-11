import { NexTwinScene } from './scene3d.js';

const $ = (sel) => document.querySelector(sel);
const els = {
  instruction: $('#instruction-input'),
  btnParse: $('#btn-parse'),
  btnRun: $('#btn-run'),
  btnCancel: $('#btn-cancel'),
  btnCameraPreview: $('#btn-camera-preview'),
  timeline: $('#timeline'),
  statusBanner: $('#status-banner'),
  connBadge: $('#conn-badge'),
  sysBadge: $('#sys-badge'),
  progressBar: $('#progress-bar'),
  panoramaView: $('#panorama-view'),
  cameraView: $('#camera-view'),
  sensorTag: $('#sensor-tag'),
  observationJson: $('#observation-json'),
  actionList: $('#action-list'),
  robotActions: $('#robot-actions'),
  resultContent: $('#result-content'),
  resultPanel: $('#result-panel'),
  logList: $('#log-list'),
  overlay: $('#scene-overlay'),
  overlayText: $('#overlay-text'),
  yoloTag: $('#yolo-tag'),
};

let ws, scene3d, currentBlueprint = null;

const PHASE_LABELS = {
  issue_command: ['1', '救援指令下达'],
  robot_start: ['2', '宇树机器人启动'],
  unitree_sensing: ['3', 'G1 雷达+视觉感知'],
  split_views: ['4', '四向画面切分'],
  yolo_detect: ['5', 'YOLO 目标识别'],
  observation_json: ['6', '观察结果 JSON'],
  rule_engine: ['7', '规则引擎决策'],
  robot_execute: ['8', '宇树执行动作'],
  rescue_success: ['9', '解救 Mini Pi'],
  display_result: ['10', '大屏显示结果'],
};

async function init() {
  scene3d = new NexTwinScene($('#scene-canvas'));
  connectWS();
  bindEvents();
  await loadSystemStatus();
  await refreshCameraPreview();
  const res = await fetch('/api/v1/demo/default');
  const data = await res.json();
  els.instruction.value = data.instruction;
  await parseTask();
}

async function loadSystemStatus() {
  try {
    const res = await fetch('/api/v1/status');
    const data = await res.json();
    const mode = data.components?.rtv?.sensor || data.components?.platform_mode || 'ui';
    const detector = data.components?.rtv?.detector || 'ui-demo';
    els.sensorTag.textContent = mode === 'ui-only' ? 'UI Demo' : mode;
    els.yoloTag.textContent = detector;
    const platformMode = data.components?.platform_mode || 'ui';
    document.getElementById('subtitle').textContent =
      platformMode === 'ui'
        ? 'UI 演示模式 · 安装视觉库后启用 G1/YOLO'
        : `G1 ${mode} · ${detector.toUpperCase()} · 规则引擎`;
  } catch (_) { /* ignore */ }
}

async function refreshCameraPreview() {
  try {
    const res = await fetch('/api/v1/camera/preview');
    const data = await res.json();
    if (data.frame_b64) renderCamera(data.frame_b64);
    if (data.split_views) renderQuadViews(data.split_views);
    if (data.detector?.mode) els.yoloTag.textContent = data.detector.mode;
    if (data.sensor_mode) els.sensorTag.textContent = data.sensor_mode;
  } catch (_) { /* G1 camera may be offline */ }
}

function bindEvents() {
  els.btnParse.addEventListener('click', parseTask);
  els.btnRun.addEventListener('click', runRescue);
  els.btnCancel.addEventListener('click', () => fetch('/api/v1/execute/cancel', { method: 'POST' }));
  els.btnCameraPreview?.addEventListener('click', refreshCameraPreview);
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { setBadge(els.connBadge, '已连接', 'badge-on'); };
  ws.onclose = () => { setBadge(els.connBadge, '未连接', 'badge-off'); setTimeout(connectWS, 3000); };
  ws.onmessage = (e) => handleWS(JSON.parse(e.data));
}

function handleWS(msg) {
  if (msg.state) updateUI(msg.state);

  switch (msg.type) {
    case 'execution_start':
      setRunning(true);
      resetTimeline();
      showOverlay('救援任务启动...');
      break;
    case 'phase_start':
      highlightPhase(msg.phase, false);
      els.statusBanner.textContent = PHASE_LABELS[msg.phase]?.[1] || msg.phase;
      break;
    case 'sensor_ready':
      renderBev(msg.bev_b64);
      renderCamera(msg.camera_b64);
      if (msg.sensor?.mode) els.sensorTag.textContent = msg.sensor.mode;
      if (msg.sensor?.point_count) els.sensorTag.title = `${msg.sensor.point_count} pts`;
      break;
    case 'panorama_ready':
      renderBev(msg.panorama_b64 || msg.bev_b64);
      break;
    case 'split_views':
      renderQuadViews(msg.views || {});
      break;
    case 'yolo_detections':
      highlightTargetView(msg.target_view);
      if (msg.summary) els.statusBanner.textContent = msg.summary;
      break;
    case 'observation_json':
      els.observationJson.textContent = JSON.stringify(msg.observation, null, 2);
      break;
    case 'action_plan':
      renderActionPlan(msg.action_plan?.actions || []);
      break;
    case 'robot_action':
      updateRobotAction(msg.action);
      break;
    case 'robot_move':
      if (msg.state?.robot_position) scene3d.updateRobotPosition(msg.state.robot_position);
      break;
    case 'rescue_success':
    case 'rescue_complete':
      hideOverlay();
      showResult(true);
      break;
    case 'display_result':
      showResult(true, msg.result);
      break;
    case 'execution_end':
      setRunning(false);
      hideOverlay();
      if (msg.state?.status === 'completed') highlightPhase('display_result', true);
      break;
    case 'phase_end':
      highlightPhase(msg.phase, true);
      break;
  }
}

async function parseTask() {
  els.btnParse.disabled = true;
  const res = await fetch('/api/v1/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction: els.instruction.value.trim() }),
  });
  const data = await res.json();
  currentBlueprint = data.blueprint;
  renderTimeline(data.blueprint.steps);
  updateUI(data.world_model);
  els.btnRun.disabled = false;
  els.btnParse.disabled = false;
}

async function runRescue() {
  els.btnRun.disabled = true;
  await fetch('/api/v1/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

function updateUI(state) {
  if (!state) return;
  els.statusBanner.textContent = state.message || '—';
  els.progressBar.style.width = `${Math.round((state.progress || 0) * 100)}%`;
  setBadge(els.sysBadge, state.status === 'completed' ? '完成' : state.status === 'running' ? '执行中' : '就绪',
    state.status === 'completed' ? 'badge-done' : state.status === 'running' ? 'badge-run' : 'badge-idle');

  if (state.objects?.length) {
    scene3d.buildScene(state.objects, state.scene_label);
    state.objects.forEach(o => {
      scene3d.updateObjectPosition(o.id, o.position);
      if (o.state === 'trapped') scene3d.updateObjectState(o.id, 'fault');
      if (o.state === 'rescued') scene3d.updateObjectState(o.id, 'rescued');
      if (o.state === 'cleared') scene3d.updateObjectState(o.id, 'cleared');
    });
  }
  if (state.robot_position) scene3d.updateRobotPosition(state.robot_position);
  if (state.bev_preview_b64 || state.panorama_preview_b64) renderBev(state.bev_preview_b64 || state.panorama_preview_b64);
  if (state.camera_preview_b64) renderCamera(state.camera_preview_b64);
  if (state.sensor_mode) els.sensorTag.textContent = state.sensor_mode;
  if (state.split_views && Object.keys(state.split_views).length) renderQuadViews(state.split_views);
  if (state.observation) els.observationJson.textContent = JSON.stringify(state.observation, null, 2);
  if (state.action_plan?.actions) renderActionPlan(state.action_plan.actions);
  if (state.logs?.length) renderLogs(state.logs);
  if (state.rescue_complete) showResult(true);
}

function renderTimeline(steps) {
  els.timeline.innerHTML = steps.map(s => {
    const [num, label] = PHASE_LABELS[s.phase] || ['?', s.label];
    return `<li data-phase="${s.phase}"><div class="tl-num">${num}</div><div class="tl-body"><strong>${label}</strong><span>${s.description}</span></div></li>`;
  }).join('');
}

function resetTimeline() {
  els.timeline.querySelectorAll('.tl-num').forEach(el => el.classList.remove('active', 'done'));
}

function highlightPhase(phase, done) {
  els.timeline.querySelectorAll('li').forEach(li => {
    const num = li.querySelector('.tl-num');
    num.classList.remove('active', 'done');
    if (li.dataset.phase === phase) num.classList.add(done ? 'done' : 'active');
    else if (done) {
      const steps = currentBlueprint?.steps || [];
      const curIdx = steps.findIndex(s => s.phase === phase);
      const liIdx = steps.findIndex(s => s.phase === li.dataset.phase);
      if (liIdx >= 0 && liIdx < curIdx) num.classList.add('done');
    }
  });
}

function renderBev(b64) {
  if (!b64) return;
  els.panoramaView.innerHTML = `<img src="data:image/jpeg;base64,${b64}" alt="LiDAR BEV" />`;
}

function renderCamera(b64) {
  if (!b64) return;
  els.cameraView.innerHTML = `<img src="data:image/jpeg;base64,${b64}" alt="Unitree Camera" />`;
}

function renderPanorama(b64) { renderBev(b64); }

function renderQuadViews(views) {
  for (const [name, b64] of Object.entries(views)) {
    const el = document.getElementById(`view-${name}`);
    if (el && b64) el.innerHTML = `<img src="data:image/jpeg;base64,${b64}" alt="${name}" />`;
  }
}

function highlightTargetView(view) {
  document.querySelectorAll('.quad-cell').forEach(c => c.classList.remove('target'));
  const cell = document.querySelector(`.quad-cell[data-view="${view}"]`);
  if (cell) cell.classList.add('target');
}

function renderActionPlan(actions) {
  els.actionList.innerHTML = actions.map(a => `
    <li><strong>${a.label || a.action}</strong><span>${a.reason || ''}</span></li>
  `).join('');
}

function updateRobotAction(action) {
  if (!action) return;
  const existing = els.robotActions.querySelector(`[data-action="${action.action}"]`);
  const cls = action.status === 'done' ? 'done' : action.status === 'running' ? 'running' : '';
  const html = `<li class="${cls}" data-action="${action.action}"><strong>${action.label || action.action}</strong><span>${action.reason || action.status}</span></li>`;
  if (existing) existing.outerHTML = html;
  else els.robotActions.insertAdjacentHTML('beforeend', html);
}

function showResult(success, result) {
  if (!success) return;
  els.resultPanel.classList.add('success');
  els.resultContent.innerHTML = `
    <div class="result-success">
      <div class="icon">🎉</div>
      <h3>Mini Pi 已成功解救</h3>
      <p>宇树机器人完成转向 → 前进 → 停止 → 推重物</p>
      <p style="margin-top:8px;color:var(--success)">任务状态: SUCCESS</p>
    </div>`;
}

function renderLogs(logs) {
  els.logList.innerHTML = logs.slice(-15).reverse().map(l =>
    `<li><span class="time">${new Date(l.timestamp).toLocaleTimeString('zh-CN')}</span>${l.message}</li>`
  ).join('');
}

function showOverlay(text) { els.overlayText.textContent = text; els.overlay.classList.remove('hidden'); }
function hideOverlay() { els.overlay.classList.add('hidden'); }
function setBadge(el, text, cls) { el.textContent = text; el.className = `badge ${cls}`; }
function setRunning(r) {
  els.btnRun.disabled = r;
  els.btnCancel.disabled = !r;
  els.btnParse.disabled = r;
}

init();
