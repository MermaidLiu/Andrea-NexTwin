/** NexTwin Studio — 开发者中心 */

let sdkItems = [];
let wmItems = [];

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Tabs ──
function initTabs() {
  document.querySelectorAll('.dev-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dev-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.dev-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`)?.classList.add('active');
    });
  });
}

// ── Drop zones ──
function initDropZone(dropId, inputId, browseId, hintId) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  if (!drop || !input) return;

  document.getElementById(browseId)?.addEventListener('click', (e) => { e.preventDefault(); input.click(); });
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    hint.textContent = input.files[0]?.name || '未选择文件';
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      hint.textContent = e.dataTransfer.files[0].name;
    }
  });
}

// ── SDK upload ──
async function initSdkUpload() {
  document.getElementById('form-sdk-upload')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const file = document.getElementById('sdk-file').files[0];
    const fd = new FormData();
    if (file) fd.append('file', file);
    fd.append('name', form.name.value);
    fd.append('version', form.version.value);
    fd.append('robot', form.robot.value);
    fd.append('description', form.description.value);

    try {
      const res = await fetch('/api/v1/developer/sdk/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '上传失败');
      toast(`SDK「${data.name}」上传成功`);
      form.reset();
      document.getElementById('sdk-filename').textContent = '未选择文件';
      await loadSdkList();
    } catch (err) {
      toast(err.message || '上传失败');
    }
  });
}

// ── WM upload ──
async function initWmUpload() {
  document.getElementById('form-wm-upload')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const file = document.getElementById('wm-file').files[0];
    const fd = new FormData();
    if (file) fd.append('file', file);
    fd.append('name', form.name.value);
    fd.append('publish_type', form.publish_type.value);
    fd.append('scene', form.scene.value);
    fd.append('fidelity', form.fidelity.value);
    fd.append('physics', form.physics.value);
    fd.append('description', form.description.value);

    try {
      const res = await fetch('/api/v1/developer/worldmodel/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '上传失败');
      toast(`世界模型「${data.name}」已提交`);
      form.reset();
      document.getElementById('wm-filename').textContent = '未选择文件';
      await loadWmList();
    } catch (err) {
      toast(err.message || '上传失败');
    }
  });
}

// ── SDK optimize ──
function initOptimize() {
  document.getElementById('form-sdk-optimize')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const sdkId = form.sdk_id.value;
    if (!sdkId) { toast('请先选择 SDK'); return; }

    const opts = [...form.querySelectorAll('input[name="opt"]:checked')].map((c) => c.value);
    const sdk = sdkItems.find((s) => s.id === sdkId);
    const scene = form.scene.value;

    const reports = opts.map((o) => {
      const tips = {
        latency: `延迟优化：${sdk?.name} 在「${scene}」场景下预估降低 12–18ms（通信批量化 + 零拷贝）`,
        memory: `内存优化：峰值占用预估减少 15%，建议启用共享内存传感器桥`,
        bandwidth: `带宽压缩：LiDAR 点云降采样 + JPEG 质量 75，带宽降 40%`,
        power: `功耗优化：空闲态降频策略，续航预估提升 8%`,
      };
      return tips[o];
    });

    const el = document.getElementById('opt-result');
    document.getElementById('opt-report').innerHTML = reports.map((r) => `<li>✓ ${r}</li>`).join('');
    el.classList.remove('hidden');
    toast('优化分析完成');
  });
}

// ── Capability buttons ──
function initCapabilities() {
  document.querySelectorAll('.cap-btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actions = {
        sandbox: '沙盒环境已打开（模拟 G1 传感器回调）',
        benchmark: '性能测评已启动，报告将发送至控制台',
        apikey: 'API Key: nx_dev_****7f2a（已复制到剪贴板）',
        webhook: 'Webhook 配置页：POST https://your-server.com/nxtwin/hook',
        publish: '已提交应用市场审核，预计 1–3 工作日',
      };
      toast(actions[btn.dataset.action] || '功能开发中');
    });
  });
}

// ── Lists ──
async function loadSdkList() {
  try {
    const res = await fetch('/api/v1/developer/sdk/list');
    sdkItems = await res.json();
  } catch { sdkItems = []; }

  const tbody = document.getElementById('sdk-list-body');
  const select = document.getElementById('opt-sdk-select');

  if (!sdkItems.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无 SDK，请先上传</td></tr>';
    select.innerHTML = '<option value="">— 先上传 SDK —</option>';
    return;
  }

  tbody.innerHTML = sdkItems.map((s) => `
    <tr>
      <td><strong>${s.name}</strong></td>
      <td>${s.version}</td>
      <td>${s.robot}</td>
      <td><span class="status-badge ${s.status}">${statusLabel(s.status)}</span></td>
      <td>${formatTime(s.uploaded_at)}</td>
      <td class="table-actions">
        <button type="button" data-del-sdk="${s.id}">删除</button>
      </td>
    </tr>`).join('');

  select.innerHTML = '<option value="">— 选择 SDK —</option>' +
    sdkItems.map((s) => `<option value="${s.id}">${s.name} v${s.version}</option>`).join('');

  tbody.querySelectorAll('[data-del-sdk]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/v1/developer/sdk/${btn.dataset.delSdk}`, { method: 'DELETE' });
      toast('已删除');
      loadSdkList();
    });
  });
}

async function loadWmList() {
  try {
    const res = await fetch('/api/v1/developer/worldmodel/list');
    wmItems = await res.json();
  } catch { wmItems = []; }

  const grid = document.getElementById('wm-list');
  if (!wmItems.length) {
    grid.innerHTML = '<p style="color:var(--text-secondary);font-size:13px">暂无世界模型，请上传</p>';
    return;
  }

  grid.innerHTML = wmItems.map((m) => `
    <div class="wm-dev-card">
      <span class="wm-type ${m.publish_type}">${typeLabel(m.publish_type)}</span>
      <h3>${m.name}</h3>
      <p>${m.description || m.scene + ' 场景'}</p>
      <div class="wm-metrics-mini">
        <span>还原度 <strong>${m.fidelity}%</strong></span>
        <span>物理 <strong>${m.physics}%</strong></span>
      </div>
      <div style="margin-top:8px"><span class="status-badge ${m.status}">${statusLabel(m.status)}</span></div>
    </div>`).join('');
}

function statusLabel(s) {
  return { draft: '草稿', review: '审核中', live: '已发布', private: '私有' }[s] || s;
}
function typeLabel(t) {
  return { platform: '平台入驻', opensource: '开源', private: '私有' }[t] || t;
}
function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDropZone('sdk-drop', 'sdk-file', 'sdk-browse', 'sdk-filename');
  initDropZone('wm-drop', 'wm-file', 'wm-browse', 'wm-filename');
  initSdkUpload();
  initWmUpload();
  initOptimize();
  initCapabilities();
  loadSdkList();
  loadWmList();
});
