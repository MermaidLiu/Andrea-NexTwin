/** NexTwin Studio — 用户工作台 */

const STEPS = ['scene', 'workflow', 'robot', 'worldmodel'];
let currentStep = 0;
let selectedRobot = null;
let selectedWm = null;
let workflowScenario = 'obstacle';
let evacuationSessionId = null;
let evacuationState = null;

const PHASE_ORDER = [
  'phase_0_language_input',
  'phase_1_scene_confirmation',
  'analysis',
  'phase_2_perimeter_judgment',
  'phase_3_target_alignment',
  'phase_4_output_validation',
  'awaiting_confirmation',
  'executing',
  'completed',
  'shelter_fallback',
];

const COZE_EDGES = [
  ['n-start', 'n-scene'],
  ['n-start', 'n-yolo'],
  ['n-scene', 'n-world'],
  ['n-yolo', 'n-world'],
  ['n-world', 'n-decide'],
  ['n-decide', 'n-gate'],
  ['n-gate', 'n-exec'],
];

const NODE_META = {
  'n-start': { title: '语言输入', type: 'Trigger', pillar: null },
  'n-scene': { title: '场景确认', type: 'Scene', pillar: null },
  'n-yolo': { title: 'YOLO 感知分析', type: 'Perception · Analysis', pillar: 'analysis' },
  'n-world': { title: '世界模型理解', type: 'World Model · Understanding', pillar: 'understand' },
  'n-decide': { title: '具身决策引擎', type: 'Embodied AI · Decision', pillar: 'decide' },
  'n-gate': { title: '输出与确认', type: 'Human Gate', pillar: null },
  'n-exec': { title: '物理执行', type: 'Runtime', pillar: null },
};

const RUN_SEQUENCE = ['n-start', 'n-scene', 'n-yolo', 'n-world', 'n-decide', 'n-gate'];

let selectedNodeId = null;
let isAnimating = false;

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

  if (currentStep === 1) {
    requestAnimationFrame(() => { drawFlowLines(); fitCanvas(); });
  }
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
  const defaultHint = '地震救援现场：纸箱子压着被困机器人，请识别场景并搬离前方长方体障碍物，解救受困目标。';
  const prompt = document.getElementById('scene-prompt');
  if (prompt && !prompt.value.trim()) prompt.value = defaultHint;

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

// ── Coze workflow engine ──
function riskColor(risk, isNoGo) {
  if (isNoGo || risk >= 0.72) return '#F53F3F';
  if (risk >= 0.4) return '#FF7D00';
  return '#00B42A';
}

function setNodeStatus(nodeId, status) {
  const node = document.querySelector(`.coze-node[data-id="${nodeId}"]`);
  if (!node) return;
  node.classList.remove('running', 'done', 'error');
  if (status === 'running') node.classList.add('running');
  if (status === 'done') node.classList.add('done');
  if (status === 'error') node.classList.add('error');
  const badge = node.querySelector('[data-status]');
  if (badge) badge.textContent = status;
}

function resetAllNodes() {
  RUN_SEQUENCE.concat(['n-exec']).forEach((id) => setNodeStatus(id, 'idle'));
  document.querySelectorAll('.coze-node').forEach((n) => n.classList.remove('selected'));
}

function drawYoloPreview(detections) {
  const canvas = document.getElementById('yolo-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#1a1d24';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < w; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
  for (let j = 0; j < h; j += 20) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }

  const colors = { obstacle_box: '#eab308', mini_pi: '#f97316', cardboard: '#d4a017', robot: '#0070FF', debris: '#86909C' };
  detections.forEach((d) => {
    const c = colors[d.cls] || '#9030F0';
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = c + '33';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = c;
    ctx.font = '9px SF Mono, monospace';
    ctx.fillText(`${d.cls} ${(d.conf * 100).toFixed(0)}%`, d.x + 2, d.y + 10);
  });
}

function buildYoloDetections(state) {
  const isObstacle = workflowScenario === 'obstacle' || state.task_context?.mission_goal === 'clear_obstacle_rescue';
  if (isObstacle) {
    return [
      { cls: 'obstacle_box', conf: 0.93, x: 24, y: 12, w: 88, h: 52 },
      { cls: 'mini_pi', conf: 0.89, x: 42, y: 38, w: 56, h: 28 },
    ];
  }
  const hazards = state.task_context?.hazard_types || [];
  const dets = [];
  if (hazards.includes('fire')) dets.push({ cls: 'fire', conf: 0.94, x: 18, y: 14, w: 52, h: 38 });
  return dets;
}

function drawFlowLines(activeEdge) {
  const svg = document.getElementById('flow-lines');
  const canvas = document.getElementById('coze-canvas');
  if (!svg || !canvas) return;

  const w = canvas.scrollWidth;
  const h = canvas.scrollHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const paths = COZE_EDGES.map(([a, b]) => {
    const na = canvas.querySelector(`[data-id="${a}"]`);
    const nb = canvas.querySelector(`[data-id="${b}"]`);
    if (!na || !nb) return '';
    const x1 = na.offsetLeft + na.offsetWidth;
    const y1 = na.offsetTop + na.offsetHeight / 2;
    const x2 = nb.offsetLeft;
    const y2 = nb.offsetTop + nb.offsetHeight / 2;
    const mx = (x1 + x2) / 2;
    const isActive = activeEdge === `${a}-${b}`;
    return `<path class="${isActive ? 'active' : ''}" data-edge="${a}-${b}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="url(#lineGrad)" stroke-width="${isActive ? 2.5 : 1.8}" opacity="${isActive ? 1 : 0.45}"/>`;
  }).join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0070FF"/>
        <stop offset="50%" stop-color="#9030F0"/>
        <stop offset="100%" stop-color="#FF7D00"/>
      </linearGradient>
    </defs>${paths}`;
}

function fitCanvas() {
  const wrap = document.querySelector('.coze-canvas-wrap');
  if (wrap) wrap.scrollLeft = 0;
}

function selectNode(nodeId) {
  selectedNodeId = nodeId;
  document.querySelectorAll('.coze-node').forEach((n) => {
    n.classList.toggle('selected', n.dataset.id === nodeId);
  });
  if (evacuationState) renderInspector(nodeId, evacuationState);
}

function renderInspector(nodeId, state) {
  const meta = NODE_META[nodeId];
  if (!meta) return;
  document.getElementById('insp-type').textContent = meta.type;
  document.getElementById('insp-title').textContent = meta.title;
  document.getElementById('insp-phase').textContent = document.querySelector(`.coze-node[data-id="${nodeId}"]`)?.dataset.phase || '—';

  const body = document.getElementById('insp-body');
  let html = '';

  if (nodeId === 'n-start' && state.task_context) {
    const t = state.task_context;
    html = `<div class="insp-section"><h4>TaskContext</h4>
      <dl class="insp-kv"><dt>指令</dt><dd>${t.instruction}</dd>
      <dt>目标</dt><dd>${t.mission_goal}</dd><dt>紧迫度</dt><dd>${t.urgency}</dd></dl></div>
      <div class="insp-section"><h4>语义实体</h4><ul class="insp-list">${(t.entities || []).map((e) => `<li><strong>${e.entity_type}</strong> · ${e.value} <span class="muted">(${(e.confidence * 100).toFixed(0)}%)</span></li>`).join('')}</ul></div>`;
  } else if (nodeId === 'n-scene' && state.scene_context) {
    const s = state.scene_context;
    html = `<div class="insp-section"><h4>SceneContext</h4>
      <dl class="insp-kv"><dt>对齐</dt><dd>${s.aligned ? '✓ 障碍搬离解救' : '✗ 未对齐'}</dd>
      <dt>场景</dt><dd>${s.hazard_type === 'earthquake_debris' ? '地震废墟' : s.hazard_type}</dd><dt>布局</dt><dd>${s.building_layout}</dd>
      <dt>集结点</dt><dd>${(s.muster_points || []).join(' → ')}</dd></dl>
      <p class="muted" style="margin-top:8px">${s.rationale}</p></div>`;
  } else if (nodeId === 'n-yolo') {
    const dets = buildYoloDetections(state);
    html = `<div class="insp-section"><h4>Detection Pipeline</h4>
      <dl class="insp-kv"><dt>模型</dt><dd>YOLOv8-n · TensorRT</dd>
      <dt>输入</dt><dd>640×480 RGB + 深度</dd><dt>检测数</dt><dd>${dets.length}</dd>
      <dt>延迟</dt><dd>18ms</dd><dt>mAP@50</dt><dd>0.912</dd></dl></div>
      <div class="insp-section"><h4>Bounding Boxes</h4><ul class="insp-list">${dets.map((d) => `<li><strong>${d.cls}</strong> conf=${(d.conf * 100).toFixed(1)}% · [${d.x},${d.y},${d.w},${d.h}]</li>`).join('')}</ul></div>`;
  } else if (nodeId === 'n-world' && state.perimeter_map) {
    const p = state.perimeter_map;
    html = `<div class="insp-section"><h4>PerimeterMap</h4>
      <dl class="insp-kv"><dt>网格</dt><dd>${p.grid_width}×${p.grid_height}</dd>
      <dt>禁行区</dt><dd>${(p.no_go_zones || []).length} 区域</dd>
      <dt>最小风险</dt><dd>${p.min_safe_risk?.toFixed(3)}</dd>
      <dt>版本</dt><dd>${p.world_model_version}</dd></dl></div>
      <div class="insp-section"><h4>结构仿真</h4>
      <dl class="insp-kv"><dt>余震概率</dt><dd>${((p.predictions?.aftershock_prob ?? 0) * 100).toFixed(0)}%</dd>
      <dt> debris 位移</dt><dd>${((p.predictions?.debris_shift_risk ?? 0) * 100).toFixed(0)}%</dd>
      <dt>施力方向</dt><dd>${p.predictions?.recommended_push_vector ?? '—'}</dd>
      <dt>安全推力</dt><dd>${p.predictions?.safe_push_force_n ?? '—'} N</dd></dl></div>
      <div class="insp-section"><h4>推演依据</h4><p>${state.output?.world_model_rationale || '—'}</p></div>`;
  } else if (nodeId === 'n-decide' && state.action_plan) {
    const a = state.action_plan;
    html = `<div class="insp-section"><h4>TargetActionPlan</h4>
      <dl class="insp-kv"><dt>可行</dt><dd>${a.feasible ? '✓ 约束满足' : '✗ 不可行'}</dd>
      <dt>电量</dt><dd>${a.robot_constraints?.battery_pct}%</dd>
      <dt>运动学</dt><dd>${a.robot_constraints?.kinematics}</dd></dl></div>
      <div class="insp-section"><h4>子目标</h4><ul class="insp-list">${(a.sub_goals || []).map((g) => `<li>${g}</li>`).join('')}</ul></div>
      <div class="insp-section"><h4>动作原语</h4><ul class="insp-list">${(a.actions || []).map((act) => `<li><strong>P${act.priority} ${act.label}</strong><br><span class="muted">${act.reason}</span></li>`).join('')}</ul></div>`;
  } else if (nodeId === 'n-gate' && state.output) {
    const o = state.output;
    html = `<div class="insp-section"><h4>最优路径</h4>
      <ul class="insp-list">${(o.optimal_path?.waypoints || []).map((wp) => `<li>${wp.label} (${wp.x}, ${wp.z}) · risk=${o.optimal_path.total_risk}</li>`).join('')}</ul></div>
      <div class="insp-section"><h4>解决方案</h4><ul class="insp-list">${(o.solution_steps || []).map((s) => `<li>${s}</li>`).join('')}</ul></div>
      <div class="insp-section"><h4>应急预案</h4><ul class="insp-list">${(o.contingency_notes || []).map((c) => `<li>${c}</li>`).join('')}</ul></div>`;
  } else if (nodeId === 'n-exec') {
    html = `<div class="insp-section"><h4>执行状态</h4>
      <p>${state.phase === 'completed' ? '✓ 方案已确认，仿真执行完成' : '等待门禁确认后下发至 G1 执行层'}</p></div>`;
  } else {
    html = '<p class="insp-placeholder muted">运行推演后查看此节点详情</p>';
  }
  body.innerHTML = html;
}

async function animatePipelineReveal(state) {
  isAnimating = true;
  resetAllNodes();
  const badge = document.getElementById('coze-run-badge');
  if (badge) { badge.textContent = '推演中'; badge.className = 'coze-badge running'; }

  const incomingEdge = {
    'n-start': null,
    'n-scene': 'n-start-n-scene',
    'n-yolo': 'n-start-n-yolo',
    'n-world': 'n-yolo-n-world',
    'n-decide': 'n-world-n-decide',
    'n-gate': 'n-decide-n-gate',
  };

  for (const nodeId of RUN_SEQUENCE) {
    setNodeStatus(nodeId, 'running');
    selectNode(nodeId);
    if (incomingEdge[nodeId]) drawFlowLines(incomingEdge[nodeId]);
    await new Promise((r) => setTimeout(r, 480));
    setNodeStatus(nodeId, 'done');
    populateNodeData(nodeId, state);
  }

  populateNodeData('n-gate', state);
  drawFlowLines(null);
  if (badge) {
    badge.textContent = state.phase === 'awaiting_confirmation' ? '等待确认' : '完成';
    badge.className = `coze-badge ${state.phase === 'awaiting_confirmation' ? 'wait' : 'done'}`;
  }
  isAnimating = false;
  selectNode('n-gate');
}

function populateNodeData(nodeId, state) {
  if (nodeId === 'n-start' && state.task_context) {
    const chips = document.getElementById('chip-entities');
    if (chips) chips.innerHTML = (state.task_context.entities || []).slice(0, 4)
      .map((e) => `<span class="chip">${e.value}</span>`).join('');
  }
  if (nodeId === 'n-scene' && state.scene_context) {
    const s = state.scene_context;
    const bar = document.getElementById('m-scene-risk');
    const al = document.getElementById('m-scene-aligned');
    if (bar) bar.style.width = `${(s.initial_risk_level || 0) * 100}%`;
    if (al) al.textContent = s.aligned ? '✓' : '✗';
  }
  if (nodeId === 'n-yolo') {
    const dets = buildYoloDetections(state);
    drawYoloPreview(dets);
    document.getElementById('m-yolo-count').textContent = dets.length;
    document.getElementById('m-yolo-map').textContent = '0.91';
    document.getElementById('m-yolo-lat').textContent = '18';
  }
  if (nodeId === 'n-world' && state.perimeter_map) {
    const p = state.perimeter_map;
    const grid = document.getElementById('risk-grid');
    if (grid && p.risk_grid) {
      grid.style.gridTemplateColumns = `repeat(${p.grid_width || 8}, 1fr)`;
      grid.innerHTML = p.risk_grid.map((c) =>
        `<div class="risk-cell" style="background:${riskColor(c.risk, c.is_no_go)}" title="risk=${c.risk}"></div>`
      ).join('');
    }
    const nogo = p.risk_grid?.filter((c) => c.is_no_go).length || 0;
    document.getElementById('m-nogo').textContent = nogo;
    const pred = p.predictions || {};
    document.getElementById('m-spread').textContent = pred.recommended_push_vector?.replace('_', '-') ?? '—';
    document.getElementById('m-horizon').textContent = pred.horizon_sec ?? 90;
  }
  if (nodeId === 'n-decide' && state.action_plan) {
    const a = state.action_plan;
    const stack = document.getElementById('action-stack');
    if (stack) stack.innerHTML = (a.actions || []).slice(0, 3).map((act) =>
      `<li><span class="prio">${act.priority}</span>${act.label}</li>`
    ).join('');
    document.getElementById('m-battery').textContent = `${a.robot_constraints?.battery_pct ?? '—'}%`;
    document.getElementById('m-actions').textContent = (a.actions || []).length;
    const ft = document.getElementById('m-feasible');
    if (ft) { ft.textContent = a.feasible ? '可行' : '不可行'; ft.className = `feas-tag ${a.feasible ? 'ok' : 'no'}`; }
  }
  if (nodeId === 'n-gate' && state.output) {
    const prev = document.getElementById('path-preview');
    if (prev) prev.innerHTML = (state.output.optimal_path?.waypoints || [])
      .map((wp, i) => `${i + 1}. ${wp.label || 'wp'} (${wp.x},${wp.z})`).join('<br>');
  }
  if (nodeId === 'n-exec' && state.phase === 'completed') {
    const ring = document.getElementById('exec-ring');
    if (ring) { ring.classList.add('active'); ring.querySelector('span').textContent = 'OK'; }
    setNodeStatus('n-exec', 'done');
  }
}

async function renderEvacuationState(state, animate = false) {
  evacuationState = state;

  if (animate) await animatePipelineReveal(state);
  else {
    RUN_SEQUENCE.forEach((id) => { setNodeStatus(id, 'done'); populateNodeData(id, state); });
    populateNodeData('n-gate', state);
    selectNode('n-gate');
  }

  const gate = document.getElementById('evac-gate');
  const statusEl = document.getElementById('evac-status');
  if (gate) gate.classList.toggle('hidden', state.phase !== 'awaiting_confirmation');
  if (statusEl) {
    statusEl.className = 'evac-status';
    if (state.phase === 'completed') {
      statusEl.classList.add('success');
      statusEl.textContent = '✓ 方案已确认，进入物理执行阶段';
      populateNodeData('n-exec', state);
    } else if (state.fallback_protocol) {
      statusEl.classList.add('warn');
      statusEl.textContent = `⚠ 已降级至 ${state.fallback_protocol}，等待确认`;
      setNodeStatus('n-world', 'error');
    } else if (state.phase === 'awaiting_confirmation') {
      statusEl.textContent = `Session ${state.session_id?.slice(0, 8)}… · 等待人机确认`;
    }
  }

  (state.logs || []).slice(-4).forEach((line) => log(line));
}

async function runEvacuationPipeline(instruction) {
  setStatus('推演中');
  log('[Pipeline] 启动地震救援工作流 · 分析→理解→决策');
  resetAllNodes();
  const badge = document.getElementById('coze-run-badge');
  if (badge) { badge.textContent = '连接中'; badge.className = 'coze-badge running'; }

  try {
    const t0 = performance.now();
    const res = await fetch('/api/v1/workflow/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction, robot_id: selectedRobot, world_model_id: selectedWm }),
    });
    if (!res.ok) throw new Error(await res.text());
    const state = await res.json();
    evacuationSessionId = state.session_id;
    workflowScenario = state.task_context?.mission_goal === 'clear_obstacle_rescue' ? 'obstacle' : 'evacuation';
    const elapsed = Math.round(performance.now() - t0);
    const lat = document.getElementById('coze-latency');
    if (lat) lat.textContent = `${elapsed}ms API + ${RUN_SEQUENCE.length * 420}ms pipeline`;
    await renderEvacuationState(state, true);
    setStatus(state.fallback_protocol ? '保守策略' : '等待确认');
    toast(state.fallback_protocol ? '结构风险偏高，已启用保守搬离策略' : '推演完成 — 请确认搬离方案');
  } catch (err) {
    setStatus('推演失败');
    toast('工作流推演失败');
    log(`[Pipeline] 错误: ${err.message}`);
    if (badge) { badge.textContent = '失败'; badge.className = 'coze-badge'; }
  }
}

async function confirmEvacuation(approved) {
  if (!evacuationSessionId) { toast('请先运行推演'); return; }
  const feedback = document.getElementById('evac-feedback')?.value.trim() || '';
  try {
    const res = await fetch(`/api/v1/workflow/${evacuationSessionId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved, feedback }),
    });
    if (!res.ok) throw new Error(await res.text());
    const state = await res.json();
    if (approved) {
      setNodeStatus('n-gate', 'done');
      setNodeStatus('n-exec', 'done');
      populateNodeData('n-exec', state);
      const badge = document.getElementById('coze-run-badge');
      if (badge) { badge.textContent = '已执行'; badge.className = 'coze-badge done'; }
    } else {
      resetAllNodes();
      await runEvacuationPipeline(state.task_context?.instruction || document.getElementById('scene-prompt')?.value.trim());
      return;
    }
    renderEvacuationState(state, false);
    setStatus(approved ? '已执行' : '重新推演');
    toast(approved ? '方案已确认并执行' : '已拒绝，重新推演');
    document.getElementById('evac-feedback').value = '';
  } catch (err) {
    toast('确认失败');
    log(`[Gate] 错误: ${err.message}`);
  }
}

function initWorkflow() {
  drawFlowLines();
  window.addEventListener('resize', () => drawFlowLines());

  document.querySelectorAll('.coze-node').forEach((node) => {
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(node.dataset.id);
    });
  });

  document.getElementById('btn-run-evacuation')?.addEventListener('click', () => {
    const text = document.getElementById('scene-prompt')?.value.trim();
    if (!text) { toast('请先在步骤 1 输入任务描述'); return; }
    runEvacuationPipeline(text);
  });
  document.getElementById('btn-fit-canvas')?.addEventListener('click', fitCanvas);
  document.getElementById('btn-evac-y')?.addEventListener('click', () => confirmEvacuation(true));
  document.getElementById('btn-evac-n')?.addEventListener('click', () => confirmEvacuation(false));

  drawYoloPreview([]);
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
    const consoleEl = document.getElementById('ws-console');
    consoleEl?.classList.toggle('collapsed');
    document.body.classList.toggle('console-expanded', !consoleEl?.classList.contains('collapsed'));
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
