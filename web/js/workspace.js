/** NexTwin Studio — 用户工作台 */

const STEPS = ['scene', 'workflow', 'robot', 'worldmodel'];
let currentStep = 0;
let selectedRobot = null;
let selectedWm = null;

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
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}

function log(msg) {
  const ul = document.getElementById('log-stream');
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

  document.querySelectorAll('.ws-step').forEach((el, i) => {
    el.classList.toggle('active', i === currentStep);
    el.classList.toggle('done', i < currentStep);
  });
  document.querySelectorAll('.step-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById(`panel-${stepId}`)?.classList.add('active');

  document.getElementById('btn-prev').disabled = currentStep === 0;
  document.getElementById('btn-next').textContent = currentStep === STEPS.length - 1 ? '完成配置' : '下一步';

  const pct = ((currentStep + 1) / STEPS.length) * 100;
  document.getElementById('progress-bar').style.width = `${pct}%`;
  document.getElementById('progress-label').textContent = `步骤 ${currentStep + 1}/${STEPS.length}`;

  if (currentStep >= 2) refreshEval();
}

function initSteps() {
  document.querySelectorAll('.ws-step').forEach((el, i) => {
    el.addEventListener('click', () => gotoStep(i));
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
    setTimeout(() => {
      setStatus('已解析');
      toast('小星已理解任务，可继续配置工作流');
      log('任务解析完成，生成 10 步蓝图');
      gotoStep(1);
    }, 600);
  });
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

  document.getElementById('btn-auto-flow')?.addEventListener('click', () => {
    log('工作流已根据任务描述自动生成');
    toast('工作流已自动生成');
    drawFlowLines();
  });

  document.getElementById('btn-add-node')?.addEventListener('click', () => {
    toast('从下方面板选择要添加的节点类型');
  });

  document.querySelectorAll('#node-palette button').forEach((btn) => {
    btn.addEventListener('click', () => {
      log(`添加节点: ${btn.textContent}`);
      toast(`已添加 ${btn.textContent} 节点`);
    });
  });
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
