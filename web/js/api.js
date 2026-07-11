/** NexTwin API Platform — DeepSeek-style billing UI */

let plansData = null;
let usageData = null;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}

function fmtMoney(n) {
  return `¥${Number(n).toFixed(2)}`;
}

function fmtQuota(v) {
  return v < 0 ? '不限' : v.toLocaleString();
}

// ── Sidebar navigation ──
function initSidebar() {
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll('.api-section').forEach((s) => s.classList.remove('active'));
      link.classList.add('active');
      document.getElementById(`section-${link.dataset.section}`)?.classList.add('active');
    });
  });
}

// ── Billing mode toggle ──
function initBillingToggle() {
  document.querySelectorAll('.billing-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.billing-toggle button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.billing-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.billing === 'monthly' ? 'monthly' : 'pay-per-use'}`)?.classList.add('active');
    });
  });
}

// ── Render monthly plans ──
function renderPlans(plans) {
  const grid = document.getElementById('plans-grid');
  grid.innerHTML = plans.map((p) => `
    <div class="plan-card${p.highlight ? ' highlight' : ''}">
      ${p.highlight ? '<span class="plan-badge">推荐</span>' : ''}
      <h3>${p.name}</h3>
      <div class="plan-price">${p.price === 0 ? '免费' : fmtMoney(p.price)}${p.price > 0 ? `<small> /月</small>` : ''}</div>
      <div class="plan-quota">
        任务解析 ${fmtQuota(p.quota.task)} 次<br>
        执行流水线 ${fmtQuota(p.quota.execute)} 次<br>
        感知扫描 ${fmtQuota(p.quota.sensor_scan)} 次
      </div>
      <ul class="plan-features">${p.features.map((f) => `<li>${f}</li>`).join('')}</ul>
      <button type="button" class="btn-brand ${p.highlight ? 'btn-primary' : 'btn-secondary'}" data-plan="${p.id}">
        ${p.price === 0 ? '当前套餐' : '订阅 ' + p.name}
      </button>
    </div>`).join('');

  grid.querySelectorAll('[data-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = plans.find((p) => p.id === btn.dataset.plan);
      toast(plan?.price ? `已选择「${plan.name}」¥${plan.price}/月，跳转支付…` : '您当前使用免费版');
    });
  });
}

// ── Render pay-per-use table ──
function renderPricingTable(items) {
  const tbody = document.getElementById('pricing-tbody');
  tbody.innerHTML = items.map((item) => `
    <tr>
      <td><code>${item.endpoint}</code><br><strong style="font-size:13px">${item.name}</strong></td>
      <td style="color:var(--text-secondary);font-size:13px">${item.description}</td>
      <td class="price-cell">${fmtMoney(item.price)} <span class="unit">/ ${item.unit}</span></td>
    </tr>`).join('');

  const calcRows = document.getElementById('calc-rows');
  calcRows.innerHTML = items.filter((i) => i.unit === '次').map((item) => `
    <div class="calc-row" data-price="${item.price}">
      <span>${item.name}</span>
      <input type="number" min="0" value="0" placeholder="月调用次数" data-calc="${item.id}" />
      <span class="calc-line">¥0.00</span>
    </div>`).join('');

  calcRows.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', updateCalc);
  });
}

function updateCalc() {
  let total = 0;
  document.querySelectorAll('.calc-row').forEach((row) => {
    const price = parseFloat(row.dataset.price);
    const count = parseInt(row.querySelector('input')?.value || '0', 10);
    const line = price * count;
    total += line;
    row.querySelector('.calc-line').textContent = fmtMoney(line);
  });
  document.getElementById('calc-total').textContent = fmtMoney(total);
}

// ── Render usage ──
const USAGE_LABELS = {
  task: '任务解析',
  execute: '执行流水线',
  sensor_scan: '感知扫描',
  camera_preview: '相机预览',
  ws_minutes: 'WebSocket 分钟',
};

function renderUsageCard(key, data) {
  const pct = data.quota > 0 ? Math.min(100, (data.used / data.quota) * 100) : 0;
  return `
    <div class="usage-card">
      <span>${USAGE_LABELS[key] || key}</span>
      <strong>${data.used.toLocaleString()} <small style="font-size:13px;color:var(--text-secondary)">/ ${fmtQuota(data.quota)}</small></strong>
      <div class="usage-bar-wrap"><div class="usage-bar" style="width:${pct}%"></div></div>
    </div>`;
}

function renderUsage(usage) {
  document.getElementById('header-balance').textContent = fmtMoney(usage.balance + usage.granted_balance);
  document.getElementById('usage-period').textContent = `当前账期 ${usage.period} · 计费模式：${usage.billing_mode === 'monthly' ? '包月套餐' : '按次计费'}`;

  const cards = Object.entries(usage.usage).map(([k, v]) => renderUsageCard(k, v)).join('');
  document.getElementById('usage-cards').innerHTML = cards;
  document.getElementById('overview-stats').innerHTML = cards;

  const tbody = document.getElementById('charges-tbody');
  tbody.innerHTML = usage.recent_charges.map((c) => `
    <tr>
      <td>${new Date(c.time).toLocaleString('zh-CN')}</td>
      <td><code>${c.api}</code></td>
      <td>${fmtMoney(c.amount)}</td>
    </tr>`).join('') || '<tr><td colspan="3">暂无扣费记录</td></tr>';

  const planName = plansData?.monthly_plans?.find((p) => p.id === usage.current_plan)?.name || usage.current_plan;
  document.getElementById('key-plan-name').textContent = planName;
}

// ── API Key ──
function initApiKey() {
  const display = document.getElementById('api-key-display');
  let key = 'nx_live_sk_8f3a2b1c9d4e7f2a';

  document.getElementById('btn-copy-key')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(key).then(() => toast('API Key 已复制'));
  });
  document.getElementById('btn-regen-key')?.addEventListener('click', () => {
    key = 'nx_live_sk_' + Math.random().toString(36).slice(2, 18);
    display.textContent = key;
    toast('已生成新 API Key');
  });
}

// ── Load data ──
async function loadData() {
  try {
    const [plansRes, usageRes] = await Promise.all([
      fetch('/api/v1/billing/plans'),
      fetch('/api/v1/billing/usage'),
    ]);
    plansData = await plansRes.json();
    usageData = await usageRes.json();
  } catch {
    plansData = { monthly_plans: [], pay_per_use: [], deduction_rules: [] };
    usageData = { balance: 0, granted_balance: 0, usage: {}, recent_charges: [], period: '—' };
  }

  renderPlans(plansData.monthly_plans || []);
  renderPricingTable(plansData.pay_per_use || []);
  renderUsage(usageData);

  const rules = document.getElementById('deduction-rules');
  rules.innerHTML = (plansData.deduction_rules || []).map((r) => `<li>${r}</li>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initBillingToggle();
  initApiKey();
  loadData();
});
