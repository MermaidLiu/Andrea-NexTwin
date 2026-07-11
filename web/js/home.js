/** NexTwin Studio — Landing page */

const DEPLOYMENTS = [
  { city: '北京', country: '中国', type: 'prod', x: 72, y: 38 },
  { city: '上海', country: '中国', type: 'prod', x: 74, y: 42 },
  { city: '深圳', country: '中国', type: 'prod', x: 73, y: 48 },
  { city: '新加坡', country: '新加坡', type: 'prod', x: 68, y: 58 },
  { city: '东京', country: '日本', type: 'prod', x: 78, y: 40 },
  { city: '慕尼黑', country: '德国', type: 'prod', x: 50, y: 34 },
  { city: '旧金山', country: '美国', type: 'prod', x: 18, y: 38 },
  { city: '波士顿', country: '美国', type: 'dev', x: 24, y: 36 },
  { city: '首尔', country: '韩国', type: 'dev', x: 76, y: 38 },
  { city: '悉尼', country: '澳大利亚', type: 'dev', x: 82, y: 72 },
];

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || getSystemTheme();
}

function updateThemeToggleUI(theme) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = theme === 'dark';
  btn.textContent = isDark ? '☀️' : '🌙';
  btn.title = isDark ? '切换浅色模式' : '切换深色模式';
  btn.setAttribute('aria-label', isDark ? '切换浅色模式' : '切换深色模式');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem('nextwin-theme', theme);
  updateThemeToggleUI(theme);
}

function initMap() {
  const container = document.getElementById('world-map');
  if (!container) return;

  DEPLOYMENTS.forEach((d, i) => {
    const dot = document.createElement('div');
    dot.className = `map-dot${d.type === 'dev' ? ' purple' : ''}`;
    dot.style.left = `${d.x}%`;
    dot.style.top = `${d.y}%`;
    dot.style.animationDelay = `${i * 0.2}s`;
    dot.innerHTML = `<span class="map-tooltip">${d.city} · ${d.country}</span>`;
    container.appendChild(dot);
  });
}

function animateStats() {
  document.querySelectorAll('.stat-value[data-target]').forEach((el) => {
    const target = parseInt(el.dataset.target, 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1800;
    const start = performance.now();

    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(target * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

async function loadStats() {
  try {
    const res = await fetch('/api/v1/platform/stats');
    const data = await res.json();
    const mapping = [
      ['world_models', 0],
      ['sdk_packages', 1],
      ['deploy_nodes', 2],
      ['developers', 3],
    ];
    const cards = document.querySelectorAll('.stat-value[data-target]');
    mapping.forEach(([key, idx]) => {
      if (data[key] != null && cards[idx]) {
        cards[idx].dataset.target = data[key];
        if (key === 'developers') cards[idx].dataset.suffix = '+';
      }
    });
  } catch (_) { /* use defaults */ }
  animateStats();
}

function initScenarios() {
  document.querySelectorAll('.scenario-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.scenario-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function initTheme() {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('nextwin-theme');
  applyTheme(saved || getSystemTheme());

  btn?.addEventListener('click', () => {
    const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('nextwin-theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

function initUser() {
  const id = localStorage.getItem('nextwin-user-id') || '游客';
  const el = document.getElementById('user-id');
  const av = document.getElementById('user-avatar');
  if (el) el.textContent = id;
  if (av) av.textContent = id.charAt(0).toUpperCase();
}

function initNav() {
  document.querySelectorAll('.main-nav a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadStats();
  initScenarios();
  initTheme();
  initUser();
  initNav();
});
