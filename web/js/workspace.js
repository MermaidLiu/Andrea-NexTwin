/** NexTwin Studio — 用户工作台 */

const STEPS = ['scene', 'workflow', 'robot', 'worldmodel'];
let currentStep = 0;
let selectedRobot = null;
let selectedWm = null;
let evacuationSessionId = null;
let evacuationState = null;

const PHASE_ORDER = [
  'phase_0_language_input',
  'phase_1_scene_confirmation',
  'phase_2_perimeter_judgment',
  'phase_3_target_alignment',
  'phase_4_output_validation',
  'awaiting_confirmation',
  'executing',
  'completed',
  'shelter_fallback',
];

const ROBOTS = [
  { id: 'g1', vendor: '宇树 Unitree', name: 'G1 人形', version: 'v2.1', type: 'humanoid', tags: ['救援', '巡检', 'ROS2'] },
  { id: 'go2', vendor: '宇树 Unitree', name: 'Go2 四足', version: 'v1.8', type: 'quadruped', tags: ['巡检', '越野'] },
  { id: 'h1', vendor: '宇树 Unitree', name: 'H1 人形', version: 'v1.2', type: 'humanoid', tags: ['工业', '搬运'] },
  { id: 'spot', vendor: 'Boston Dynamics', name: 'Spot', version: 'v3.0', type: 'quadruped', tags: ['巡检', '危险环境'] },
  { id: 'franka', vendor: 'Franka Emika', name: 'Panda', version: 'v2.5', type: 'arm', tags: ['工业维护', '精密操作'] },
  { id: 'ur5', vendor: 'Universal Robots', name: 'UR5e', version: 'v5.11', type: 'arm', tags: ['协作', '仓储'] },
];

const WORLD_MODELS = [
  { id: 'wm1', name: 'collapse-rescue-v2', source: 'platform', scene: 'rescue', fidelity: 92, physics: 88, desc: '坍塌救援场景，含 Mini Pi 与重物' },
  { id: 'wm2', name: 'factory-inspection-a', source: 'platform', scene: 'industrial', fidelity: 87, physics: 90, desc: '工业 A 区巡检，多楼层结构' },
  { id: 'wm3', name: 'open-warehouse-nav', source: 'opensource', scene: 'nav', fidelity: 78, physics: 82, desc: '开源仓储导航基准场景' },
  { id: 'wm4', name: 'urban-disaster', source: 'opensource', scene: 'rescue', fidelity: 85, physics: 79, desc: '城市灾害开源模型' },
  { id: 'wm5', name: 'indoor-lab-v3', source: 'platform', scene: 'indoor', fidelity: 94, physics: 91, desc: '高精度室内实验室' },
  { id: 'wm6', name: 'mining-tunnel', source: 'platform', scene: 'rescue', fidelity: 81, physics: 86, desc: '矿道救援仿真' },
];

const EVAL = {
  scores: [
    { label: '任务完成率', value: 94 },
    { label: '路径效率', value: 87 },
    { label: '感知精度', value: 91 },
    { label: '响应延迟', value: 82 },
    { label: '能耗比', value: 88 },
    { label: '安全评分', value: 96 },
  ],
  formula: 'Score = 0.30×Completion + 0.25×Perception + 0.20×PathEff + 0.15×Safety + 0.10×Energy',
  total: 89.6,
  dims: [
    { name: 'Completion', val: 94 },
    { name: 'Perception', val: 91 },
    { name: 'PathEff', val: 87 },
    { name: 'Safety', val: 96 },
    { name: 'Energy', val: 88 },
    { name: 'Latency', val: 82 },
  ],
  suggestions: '建议启用 LiDAR 融合节点提升感知精度；世界模型 physics 参数可微调至 90+ 以减少真机偏差。',
};

const REALDATA = [
  { metric: '定位误差 (m)', sim: '0.12', real: '0.15', delta: '+25%', status: 'ok' },
  { metric: '目标识别率', sim: '94.2%', real: '91.8%', delta: '-2.4%', status: 'ok' },
  { metric: '路径长度 (m)', sim: '18.4', real: '19.1', delta: '+3.8%', status: 'ok' },
  { metric: '执行耗时 (s)', sim: '42.0', real: '48.5', delta: '+15.5%', status: 'warn' },
  { metric: '碰撞次数', sim: '0', real: '0', delta: '0', status: 'ok' },
];

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}

function log(msg) {
  const ul = document.getElementById('log-stream');
  if (!ul) return;
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const li = document.createElement('li');
  li.innerHTML = `<span class="time">${time}</span>${msg}`;
  ul.prepend(li);
  if (ul.children.length > 50) ul.lastChild.remove();
}

function setStatus(text) {
  document.getElementById('ws-status').textContent = text;
}

// ── Step navigation ──
function gotoStep(idx) {
  currentStep = Math.max(0, Math.min(STEPS.length - 1, idx));
  const stepId = STEPS[currentStep];

  document.querySelectorAll('#flow-steps .ws-step').forEach((el) => {
    const stepIdx = STEPS.indexOf(el.dataset.step);
    el.classList.toggle('active', stepIdx === currentStep);
    el.classList.toggle('done', stepIdx >= 0 && stepIdx < currentStep);
    el.setAttribute('aria-selected', stepIdx === currentStep ? 'true' : 'false');
    el.closest('li')?.classList.toggle('done', stepIdx >= 0 && stepIdx < currentStep);
  });

  document.querySelectorAll('.step-panel').forEach((p) => {
    p.classList.remove('active');
    p.hidden = true;
  });
  const panel = document.getElementById(`panel-${stepId}`);
  if (panel) {
    panel.classList.add('active');
    panel.hidden = false;
  }

  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  if (prevBtn) prevBtn.disabled = currentStep === 0;
  if (nextBtn) nextBtn.textContent = currentStep === STEPS.length - 1 ? '完成配置' : '下一步';

  const pct = ((currentStep + 1) / STEPS.length) * 100;
  const bar = document.getElementById('progress-bar');
  const label = document.getElementById('progress-label');
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = `步骤 ${currentStep + 1}/${STEPS.length}`;

  const main = document.getElementById('ws-main');
  if (main) main.scrollTop = 0;

  if (currentStep === 1) requestAnimationFrame(drawFlowLines);
  if (currentStep >= 2) refreshEval();
}

function initSteps() {
  const flow = document.getElementById('flow-steps');
  flow?.addEventListener('click', (e) => {
    const step = e.target.closest('.ws-step');
    if (!step?.dataset.step) return;
    const idx = STEPS.indexOf(step.dataset.step);
    if (idx >= 0) gotoStep(idx);
  });

  document.getElementById('btn-prev')?.addEventListener('click', () => gotoStep(currentStep - 1));
  document.getElementById('btn-next')?.addEventListener('click', () => {
    if (currentStep === STEPS.length - 1) {
      setStatus('已就绪');
      toast('配置完成，可进入 Studio 运行 Demo');
      log('配置流程完成，机器人和世界模型已绑定');
      return;
    }
    gotoStep(currentStep + 1);
  });
}

// ── Scene ──
function initScene() {
  document.querySelectorAll('.hint-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('scene-prompt').value = btn.dataset.hint;
    });
  });
  document.getElementById('btn-scene-send')?.addEventListener('click', () => {
    const text = document.getElementById('scene-prompt').value.trim();
    if (!text) { toast('请先描述你的任务'); return; }
    setStatus('解析中');
    log(`收到任务描述: ${text.slice(0, 40)}…`);
    gotoStep(1);
    runEvacuationPipeline(text);
  });
}

// ── Evacuation workflow API ──
function riskColor(risk, isNoGo) {
  if (isNoGo || risk >= 0.72) return '#F53F3F';
  if (risk >= 0.4) return '#FF7D00';
  return '#00B42A';
}

function updateEvacPipeline(phase) {
  const idx = PHASE_ORDER.indexOf(phase);
  document.querySelectorAll('.evac-phase').forEach((el) => {
    const pIdx = PHASE_ORDER.indexOf(el.dataset.phase);
    el.classList.toggle('active', el.dataset.phase === phase);
    el.classList.toggle('done', pIdx >= 0 && pIdx < idx && phase !== 'shelter_fallback');
    el.classList.toggle('fallback', phase === 'shelter_fallback' && el.dataset.phase === 'phase_2_perimeter_judgment');
  });
}

function renderEvacuationState(state) {
  evacuationState = state;
  updateEvacPipeline(state.phase);

  const grid = document.getElementById('risk-grid');
  if (grid && state.perimeter_map?.risk_grid) {
    const cells = state.perimeter_map.risk_grid;
    const w = state.perimeter_map.grid_width || 8;
    grid.style.gridTemplateColumns = `repeat(${w}, 1fr)`;
    grid.innerHTML = cells.map((c) =>
      `<div class="risk-cell" style="background:${riskColor(c.risk, c.is_no_go)}" title="(${c.x},${c.y}) risk=${c.risk}"></div>`
    ).join('');
  }

  const actions = state.action_plan?.actions || [];
  const actionList = document.getElementById('action-list');
  if (actionList) {
    actionList.innerHTML = actions.length
      ? actions.map((a) => `<li><strong>${a.label}</strong> <span class="muted">P${a.priority}</span><br><small>${a.reason}</small></li>`).join('')
      : '<li class="muted">备用协议 — 无外出动作</li>';
  }

  const path = state.output?.optimal_path?.waypoints || [];
  const pathList = document.getElementById('path-list');
  if (pathList) {
    pathList.innerHTML = path.length
      ? path.map((wp) => `<li>${wp.label || 'waypoint'} (${wp.x}, ${wp.z})</li>`).join('')
      : '<li class="muted">—</li>';
  }

  const solutions = state.output?.solution_steps || [];
  const solList = document.getElementById('solution-list');
  if (solList) {
    solList.innerHTML = solutions.length
      ? solutions.map((s) => `<li>${s}</li>`).join('')
      : '<li class="muted">—</li>';
  }

  const rationale = document.getElementById('wm-rationale');
  if (rationale) {
    rationale.textContent = state.output?.world_model_rationale || '—';
    rationale.classList.toggle('muted', !state.output?.world_model_rationale);
  }

  const gate = document.getElementById('evac-gate');
  const statusEl = document.getElementById('evac-status');
  if (gate) {
    gate.classList.toggle('hidden', state.phase !== 'awaiting_confirmation');
  }
  if (statusEl) {
    statusEl.className = 'evac-status';
    if (state.phase === 'completed') {
      statusEl.classList.add('success');
      statusEl.textContent = '✓ 方案已确认，进入执行阶段（模拟完成）';
    } else if (state.fallback_protocol) {
      statusEl.classList.add('warn');
      statusEl.textContent = `⚠ 已降级至 ${state.fallback_protocol}，等待确认`;
    } else if (state.phase === 'awaiting_confirmation') {
      statusEl.textContent = `Session ${state.session_id?.slice(0, 8)}… — 等待 Y/N 确认`;
    } else {
      statusEl.textContent = `当前阶段: ${state.phase}`;
    }
  }

  (state.logs || []).slice(-6).forEach((line) => {
    if (!line.startsWith('[Gate]')) log(line);
  });
}

async function runEvacuationPipeline(instruction) {
  setStatus('推演中');
  log('[Evacuation] 启动 5 阶段工作流…');
  try {
    const body = {
      instruction,
      robot_id: selectedRobot,
      world_model_id: selectedWm,
    };
    const res = await fetch('/api/v1/evacuation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const state = await res.json();
    evacuationSessionId = state.session_id;
    renderEvacuationState(state);
    setStatus(state.fallback_protocol ? '掩体避险' : '等待确认');
    toast(state.fallback_protocol ? '无法找到安全路径，已启用备用协议' : '推演完成，请确认方案');
    log(`[Evacuation] 推演完成 phase=${state.phase}`);
  } catch (err) {
    setStatus('推演失败');
    toast('工作流推演失败');
    log(`[Evacuation] 错误: ${err.message}`);
  }
}

async function confirmEvacuation(approved) {
  if (!evacuationSessionId) { toast('请先运行推演'); return; }
  const feedback = document.getElementById('evac-feedback')?.value.trim() || '';
  try {
    const res = await fetch(`/api/v1/evacuation/${evacuationSessionId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved, feedback }),
    });
    if (!res.ok) throw new Error(await res.text());
    const state = await res.json();
    renderEvacuationState(state);
    if (approved) {
      setStatus('已执行');
      toast('方案已确认并执行');
      log('[Gate] 用户确认 Y');
    } else {
      setStatus('重新推演');
      toast('已拒绝，重新从阶段 1 推演');
      log(`[Gate] 用户拒绝 N${feedback ? `: ${feedback}` : ''}`);
      document.getElementById('evac-feedback').value = '';
    }
  } catch (err) {
    toast('确认失败');
    log(`[Evacuation] 确认错误: ${err.message}`);
  }
}

// ── Workflow canvas ──
const EDGES = [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n3', 'n5'], ['n4', 'n6'], ['n5', 'n6']];

function drawFlowLines() {
  const svg = document.getElementById('flow-lines');
  const canvas = document.getElementById('coze-canvas');
  if (!svg || !canvas) return;

  const rect = canvas.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${canvas.scrollWidth} ${canvas.scrollHeight}`);

  const paths = EDGES.map(([a, b]) => {
    const na = canvas.querySelector(`[data-id="${a}"]`);
    const nb = canvas.querySelector(`[data-id="${b}"]`);
    if (!na || !nb) return '';
    const x1 = na.offsetLeft + na.offsetWidth;
    const y1 = na.offsetTop + na.offsetHeight / 2;
    const x2 = nb.offsetLeft;
    const y2 = nb.offsetTop + nb.offsetHeight / 2;
    const mx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="url(#lineGrad)" stroke-width="2" opacity="0.7"/>`;
  }).join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0070FF"/>
        <stop offset="100%" stop-color="#9030F0"/>
      </linearGradient>
    </defs>${paths}`;
}

function initWorkflowDrag() {
  const canvas = document.getElementById('coze-canvas');
  canvas?.querySelectorAll('.wf-node').forEach((node) => {
    let dragging = false, ox = 0, oy = 0;
    node.addEventListener('mousedown', (e) => {
      dragging = true;
      ox = e.clientX - node.offsetLeft;
      oy = e.clientY - node.offsetTop;
      node.style.zIndex = 10;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      node.style.left = `${Math.max(0, e.clientX - ox)}px`;
      node.style.top = `${Math.max(0, e.clientY - oy)}px`;
      drawFlowLines();
    });
    document.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; node.style.zIndex = 2; }
    });
  });
}

function initWorkflow() {
  drawFlowLines();
  window.addEventListener('resize', drawFlowLines);
  initWorkflowDrag();

  document.getElementById('btn-run-evacuation')?.addEventListener('click', () => {
    const text = document.getElementById('scene-prompt')?.value.trim();
    if (!text) { toast('请先在步骤 1 输入任务描述'); return; }
    runEvacuationPipeline(text);
  });

  document.getElementById('btn-evac-y')?.addEventListener('click', () => confirmEvacuation(true));
  document.getElementById('btn-evac-n')?.addEventListener('click', () => confirmEvacuation(false));
}

// ── Robot cards ──
function renderRobots(filter = 'all') {
  const grid = document.getElementById('robot-grid');
  const items = filter === 'all' ? ROBOTS : ROBOTS.filter((r) => r.type === filter);
  grid.innerHTML = items.map((r) => `
    <div class="product-card${selectedRobot === r.id ? ' selected' : ''}" data-id="${r.id}">
      <div class="vendor">${r.vendor}</div>
      <h3>${r.name}</h3>
      <div class="version">${r.version}</div>
      <div class="tags">${r.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
    </div>`).join('');

  grid.querySelectorAll('.product-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedRobot = card.dataset.id;
      const r = ROBOTS.find((x) => x.id === selectedRobot);
      renderRobots(filter);
      log(`选择机器人: ${r?.name}`);
      toast(`已选择 ${r?.name}`);
    });
  });
}

function initRobotFilters() {
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderRobots(btn.dataset.filter);
    });
  });
  renderRobots();
}

// ── World model cards ──
function renderWm(filter = 'all') {
  const grid = document.getElementById('wm-grid');
  let items = WORLD_MODELS;
  if (filter === 'platform') items = items.filter((w) => w.source === 'platform');
  else if (filter === 'opensource') items = items.filter((w) => w.source === 'opensource');
  else if (filter === 'rescue') items = items.filter((w) => w.scene === 'rescue');

  grid.innerHTML = items.map((w) => `
    <div class="wm-card${selectedWm === w.id ? ' selected' : ''}" data-id="${w.id}">
      <span class="wm-source ${w.source}">${w.source === 'platform' ? '平台入驻' : '开源'}</span>
      <h3>${w.name}</h3>
      <p style="font-size:12px;color:var(--text-secondary)">${w.desc}</p>
      <div class="wm-metrics">
        <div class="metric-row"><span>还原度</span><div class="metric-bar"><i style="width:${w.fidelity}%"></i></div><span class="metric-val">${w.fidelity}%</span></div>
        <div class="metric-row"><span>物理</span><div class="metric-bar"><i style="width:${w.physics}%"></i></div><span class="metric-val">${w.physics}%</span></div>
      </div>
    </div>`).join('');

  grid.querySelectorAll('.wm-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedWm = card.dataset.id;
      const w = WORLD_MODELS.find((x) => x.id === selectedWm);
      renderWm(filter);
      log(`选择世界模型: ${w?.name}`);
      toast(`已选择 ${w?.name}`);
    });
  });
}

function initWmFilters() {
  document.querySelectorAll('[data-wm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-wm]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderWm(btn.dataset.wm);
    });
  });
  renderWm();
}

// ── Console ──
function initConsole() {
  document.querySelectorAll('.console-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.console-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
    });
  });

  document.getElementById('btn-console-toggle')?.addEventListener('click', () => {
    document.getElementById('ws-console').classList.toggle('collapsed');
  });
}

function refreshEval() {
  document.getElementById('eval-scores').innerHTML = EVAL.scores.map((s) => `
    <div class="score-chip"><span>${s.label}</span><strong>${s.value}</strong></div>`).join('');
  document.getElementById('formula-text').textContent = EVAL.formula;
  document.getElementById('score-total').textContent = EVAL.total;
  document.getElementById('dim-scores').innerHTML = EVAL.dims.map((d) =>
    `<li><span>${d.name}</span><strong>${d.val}</strong></li>`).join('');
  document.getElementById('suggestions').innerHTML =
    `<strong>优化建议</strong>${EVAL.suggestions}`;

  document.getElementById('realdata-body').innerHTML = REALDATA.map((r) => `
    <tr>
      <td>${r.metric}</td><td>${r.sim}</td><td>${r.real}</td><td>${r.delta}</td>
      <td class="status-${r.status}">${r.status === 'ok' ? '正常' : '关注'}</td>
    </tr>`).join('');
}

function initLogs() {
  log('工作台已就绪，等待任务描述…');
}

document.addEventListener('DOMContentLoaded', () => {
  initSteps();
  initScene();
  initWorkflow();
  initRobotFilters();
  initWmFilters();
  initConsole();
  initLogs();
  refreshEval();
  gotoStep(0);
});
