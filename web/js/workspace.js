/** NexTwin Studio — 用户工作台 */

const STEPS = ['scene', 'workflow', 'robot', 'worldmodel'];
let currentStep = 0;

const ROBOTS = [
  { id: 'g1', vendor: '宇树 Unitree', name: 'G1 人形机器人', version: 'v2.1', type: 'humanoid', tags: ['救援', '巡检', '人形'] },
  { id: 'go2', vendor: '宇树 Unitree', name: 'Go2 四足', version: 'v1.6', type: 'quadruped', tags: ['巡检', '导航', '四足'] },
  { id: 'h1', vendor: '宇树 Unitree', name: 'H1 全尺寸人形', version: 'v1.0', type: 'humanoid', tags: ['研究', '全尺寸'] },
  { id: 'rm65', vendor: '睿尔曼', name: 'RM65 机械臂', version: 'v3.2', type: 'arm', tags: ['工业', '抓取', '维护'] },
  { id: 'spot', vendor: 'Boston Dynamics', name: 'Spot', version: 'Enterprise', type: 'quadruped', tags: ['巡检', '工业', '四足'] },
  { id: 'agibot', vendor: '智元 AgiBot', name: '远征 A1', version: 'beta', type: 'humanoid', tags: ['通用', '人形'] },
];

const WORLD_MODELS = [
  { id: 'rescue-v1', name: 'RescueScene WM', source: 'platform', scene: 'rescue', fidelity: 92, physics: 88, latency: 95, desc: 'NexTwin 官方救援场景世界模型' },
  { id: 'indoor-nav', name: 'IndoorNav-3D', source: 'platform', scene: 'inspection', fidelity: 89, physics: 91, latency: 90, desc: '室内导航高精度模型' },
  { id: 'habitat', name: 'Habitat-Sim WM', source: 'opensource', scene: 'general', fidelity: 85, physics: 94, latency: 78, desc: 'Meta 开源室内仿真世界模型' },
  { id: 'isaac', name: 'Isaac Sim WM', source: 'opensource', scene: 'industrial', fidelity: 96, physics: 97, latency: 72, desc: 'NVIDIA Isaac 工业级物理仿真' },
  { id: 'mujoco-wm', name: 'MuJoCo Physics WM', source: 'opensource', scene: 'general', fidelity: 88, physics: 98, latency: 85, desc: 'DeepMind MuJoCo 物理引擎封装' },
  { id: 'collapse-rescue', name: '坍塌救援 WM', source: 'platform', scene: 'rescue', fidelity: 94, physics: 90, latency: 88, desc: '平台入驻 · 灾害救援专用' },
];

const WEIGHTS = { fidelity: 0.35, physics: 0.30, latency: 0.20, match: 0.15 };

let state = {
  scenePrompt: '',
  selectedRobot: null,
  selectedWM: null,
};

// ── Flow navigation ──
function goToStep(idx) {
  currentStep = Math.max(0, Math.min(idx, STEPS.length - 1));
  const stepId = STEPS[currentStep];

  document.querySelectorAll('.flow-step').forEach((el, i) => {
    el.classList.toggle('active', i === currentStep);
    el.classList.toggle('done', i < currentStep);
  });

  document.querySelectorAll('.step-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById(`panel-${stepId}`)?.classList.add('active');

  document.getElementById('btn-prev').disabled = currentStep === 0;
  document.getElementById('btn-next').textContent = currentStep === STEPS.length - 1 ? '完成配置' : '下一步';

  updateEval();
  log(`切换到步骤 ${currentStep + 1}: ${stepId}`);
}

// ── Step 1: Scene ──
function initScene() {
  const ta = document.getElementById('scene-prompt');
  document.querySelectorAll('.hint-chip').forEach((btn) => {
    btn.addEventListener('click', () => { ta.value = btn.dataset.hint; ta.focus(); });
  });
  document.getElementById('btn-scene-send')?.addEventListener('click', () => {
    state.scenePrompt = ta.value.trim();
    if (!state.scenePrompt) { ta.focus(); return; }
    log(`场景描述: ${state.scenePrompt.slice(0, 60)}…`);
    goToStep(1);
  });
  ta?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('btn-scene-send')?.click(); }
  });
}

// ── Step 2: Workflow ──
function initWorkflow() {
  drawFlowLines();
  makeNodesDraggable();

  document.getElementById('btn-auto-flow')?.addEventListener('click', () => {
    log('自动生成工作流: 语言输入 → 任务解析 → 世界模型 → 感知 → 规则引擎 → 执行');
    drawFlowLines();
  });

  document.querySelectorAll('#node-palette button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const canvas = document.getElementById('coze-canvas');
      const node = document.createElement('div');
      node.className = 'wf-node';
      node.dataset.id = `n${Date.now()}`;
      node.style.left = `${120 + Math.random() * 400}px`;
      node.style.top = `${40 + Math.random() * 120}px`;
      node.innerHTML = `<span class="wf-icon">➕</span><strong>${btn.textContent}</strong><small>自定义节点</small>`;
      canvas.appendChild(node);
      makeNodeDraggable(node);
      drawFlowLines();
      log(`添加节点: ${btn.textContent}`);
    });
  });
}

function drawFlowLines() {
  const svg = document.getElementById('flow-lines');
  if (!svg) return;
  const canvas = document.getElementById('coze-canvas');
  const nodes = [...canvas.querySelectorAll('.wf-node')].sort((a, b) => {
    return parseInt(a.style.left) - parseInt(b.style.left);
  });
  let paths = '';
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodeCenter(nodes[i], canvas);
    const b = nodeCenter(nodes[i + 1], canvas);
    const mx = (a.x + b.x) / 2;
    paths += `<path d="M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}" fill="none" stroke="#0070FF" stroke-width="2" opacity="0.4"/>`;
    paths += `<circle cx="${b.x}" cy="${b.y}" r="3" fill="#0070FF"/>`;
  }
  svg.innerHTML = paths;
}

function nodeCenter(el, canvas) {
  const cr = canvas.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2 };
}

function makeNodesDraggable() {
  document.querySelectorAll('.wf-node').forEach(makeNodeDraggable);
}

function makeNodeDraggable(node) {
  let dragging = false, ox, oy, sl, st;
  node.addEventListener('mousedown', (e) => {
    dragging = true;
    ox = e.clientX; oy = e.clientY;
    sl = parseInt(node.style.left); st = parseInt(node.style.top);
    node.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    node.style.left = `${sl + e.clientX - ox}px`;
    node.style.top = `${st + e.clientY - oy}px`;
    drawFlowLines();
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    node.style.cursor = 'grab';
  });
}

// ── Step 3: Robots ──
function renderRobots(filter = 'all') {
  const grid = document.getElementById('robot-grid');
  grid.innerHTML = ROBOTS
    .filter((r) => filter === 'all' || r.type === filter)
    .map((r) => `
      <div class="product-card${state.selectedRobot === r.id ? ' selected' : ''}" data-id="${r.id}">
        <div class="vendor">${r.vendor}</div>
        <h3>${r.name}</h3>
        <div class="version">版本 ${r.version}</div>
        <div class="tags">${r.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      </div>`).join('');

  grid.querySelectorAll('.product-card').forEach((card) => {
    card.addEventListener('click', () => {
      state.selectedRobot = card.dataset.id;
      renderRobots(filter);
      const r = ROBOTS.find((x) => x.id === state.selectedRobot);
      log(`选择机器人: ${r?.name} (${r?.version})`);
      updateEval();
    });
  });
}

function initRobotFilters() {
  document.querySelectorAll('.filter[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter[data-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderRobots(btn.dataset.filter);
    });
  });
  renderRobots();
}

// ── Step 4: World Models ──
function renderWorldModels(filter = 'all') {
  const grid = document.getElementById('wm-grid');
  grid.innerHTML = WORLD_MODELS
    .filter((m) => {
      if (filter === 'all') return true;
      if (filter === 'platform') return m.source === 'platform';
      if (filter === 'opensource') return m.source === 'opensource';
      if (filter === 'rescue') return m.scene === 'rescue';
      return true;
    })
    .map((m) => `
      <div class="wm-card${state.selectedWM === m.id ? ' selected' : ''}" data-id="${m.id}">
        <span class="wm-source ${m.source}">${m.source === 'platform' ? '平台入驻' : '开源'}</span>
        <h3>${m.name}</h3>
        <p style="font-size:12px;color:var(--text-secondary)">${m.desc}</p>
        <div class="wm-metrics">
          ${metricBar('还原度', m.fidelity)}
          ${metricBar('物理精度', m.physics)}
          ${metricBar('推理延迟', m.latency)}
        </div>
      </div>`).join('');

  grid.querySelectorAll('.wm-card').forEach((card) => {
    card.addEventListener('click', () => {
      state.selectedWM = card.dataset.id;
      renderWorldModels(filter);
      const m = WORLD_MODELS.find((x) => x.id === state.selectedWM);
      log(`选择世界模型: ${m?.name} (还原度 ${m?.fidelity}%)`);
      updateEval();
    });
  });
}

function metricBar(label, val) {
  return `<div class="metric-row"><span>${label}</span><div class="metric-bar"><i style="width:${val}%"></i></div><span class="metric-val">${val}%</span></div>`;
}

function initWMFilters() {
  document.querySelectorAll('.filter[data-wm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter[data-wm]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderWorldModels(btn.dataset.wm);
    });
  });
  renderWorldModels();
}

// ── Console tabs ──
function initConsoleTabs() {
  document.querySelectorAll('.console-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.console-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
    });
  });
}

// ── Evaluation ──
function updateEval() {
  const wm = WORLD_MODELS.find((m) => m.id === state.selectedWM);
  const robot = ROBOTS.find((r) => r.id === state.selectedRobot);

  const dims = {
    fidelity: wm?.fidelity ?? 70,
    physics: wm?.physics ?? 75,
    latency: wm?.latency ?? 80,
    match: robot ? 85 : 60,
  };

  const total = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + dims[k] * w, 0);
  const totalRounded = Math.round(total * 10) / 10;

  document.getElementById('formula-text').textContent =
    `Score = ${WEIGHTS.fidelity}×还原度 + ${WEIGHTS.physics}×物理精度 + ${WEIGHTS.latency}×推理延迟 + ${WEIGHTS.match}×场景匹配\n= ${WEIGHTS.fidelity}×${dims.fidelity} + ${WEIGHTS.physics}×${dims.physics} + ${WEIGHTS.latency}×${dims.latency} + ${WEIGHTS.match}×${dims.match} = ${totalRounded}`;

  document.getElementById('score-total').textContent = totalRounded;

  document.getElementById('dim-scores').innerHTML = [
    ['还原度', dims.fidelity, WEIGHTS.fidelity],
    ['物理精度', dims.physics, WEIGHTS.physics],
    ['推理延迟', dims.latency, WEIGHTS.latency],
    ['场景匹配', dims.match, WEIGHTS.match],
  ].map(([label, val, w]) => `<li><span>${label} (×${w})</span><strong>${val}</strong></li>`).join('');

  document.getElementById('eval-scores').innerHTML = Object.entries(dims)
    .map(([k, v]) => {
      const labels = { fidelity: '还原度', physics: '物理', latency: '延迟', match: '匹配' };
      return `<div class="score-chip"><span>${labels[k]}</span><strong>${v}</strong></div>`;
    }).join('');

  const suggestions = [];
  if (dims.fidelity < 85) suggestions.push('建议选用还原度更高的世界模型，或增加场景标注数据');
  if (dims.physics < 85) suggestions.push('物理精度偏低，推荐 Isaac Sim 或 MuJoCo 类模型');
  if (dims.latency < 80) suggestions.push('推理延迟较高，可启用边缘缓存或轻量化 WM 版本');
  if (!robot) suggestions.push('尚未选择机器人，场景匹配分将被拉低');
  if (!wm) suggestions.push('尚未选择世界模型，建议完成第 4 步配置');
  if (totalRounded >= 88) suggestions.push('当前配置优秀，可直接进入 Studio 执行测评');

  document.getElementById('suggestions').innerHTML =
    `<strong>💡 优化建议</strong>${suggestions.map((s) => `<div>· ${s}</div>`).join('')}`;

  document.getElementById('ws-status').textContent =
    totalRounded >= 85 ? '配置就绪' : `配置中 ${Math.round((currentStep + 1) / STEPS.length * 100)}%`;

  renderRealData(dims, totalRounded);
}

function renderRealData(dims, total) {
  document.getElementById('realdata-body').innerHTML = [
    ['任务成功率', '94.2%', '91.8%', '-2.4%', 'ok'],
    ['路径规划偏差 (m)', '0.12', '0.18', '+0.06', 'warn'],
    ['感知置信度', '88.5%', '86.1%', '-2.4%', 'ok'],
    ['执行延迟 (ms)', '320', '385', '+65', 'warn'],
    ['综合得分', `${total}`, `${total - 3}`, '-3', total >= 85 ? 'ok' : 'warn'],
  ].map(([m, sim, real, diff, st]) =>
    `<tr><td>${m}</td><td>${sim}</td><td>${real}</td><td>${diff}</td><td class="status-${st}">${st === 'ok' ? '✓ 正常' : '⚠ 关注'}</td></tr>`
  ).join('');
}

// ── Logs ──
const logs = [];
function log(msg) {
  const time = new Date().toLocaleTimeString('zh-CN');
  logs.unshift({ time, msg });
  const el = document.getElementById('log-stream');
  if (el) el.innerHTML = logs.slice(0, 30).map((l) => `<li><span class="time">${l.time}</span>${l.msg}</li>`).join('');
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.flow-step').forEach((step, i) => {
    step.addEventListener('click', () => goToStep(i));
  });
  document.getElementById('btn-prev')?.addEventListener('click', () => goToStep(currentStep - 1));
  document.getElementById('btn-next')?.addEventListener('click', () => {
    if (currentStep < STEPS.length - 1) goToStep(currentStep + 1);
    else {
      log('配置完成，跳转 Studio…');
      window.location.href = '/studio';
    }
  });

  initScene();
  initWorkflow();
  initRobotFilters();
  initWMFilters();
  initConsoleTabs();
  updateEval();
  log('NexTwin Studio 工作台已就绪');
});
