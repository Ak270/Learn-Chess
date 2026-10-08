// Shared UI helpers: settings, toast, modal, sound, charts, confetti.
const KEY = 'mentor.ui.settings.v1';
const defaults = { theme: 'dark', board: 'green', motion: 'on', sound: true, coords: true, highlights: true, minutes: 40, restDay: 'Sunday', mode: 'coach' };
let s = { ...defaults };
try { s = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage blocked: run with defaults */ }

export const settings = {
  get: (k) => s[k],
  set(k, v) { s[k] = v; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } applySettings(); },
  all: () => ({ ...s }),
};
export function applySettings() {
  const r = document.documentElement;
  r.dataset.theme = s.theme; r.dataset.board = s.board; r.dataset.motion = s.motion;
}
applySettings();

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function toast(msg, kind = '', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = 0; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms);
}

export function modal(html, { onMount, dismissable = true } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg'; bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => bg.remove();
  if (dismissable) bg.addEventListener('pointerdown', (e) => { if (e.target === bg) close(); });
  $('#modal-root').appendChild(bg);
  onMount && onMount(bg, close);
  return close;
}

let ac;
export function sound(kind = 'move') {
  if (!settings.get('sound')) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    const f = { move: 520, capture: 340, check: 780, bad: 160, good: 880 }[kind] || 500;
    o.frequency.value = f; o.type = kind === 'capture' ? 'square' : 'triangle';
    g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.14);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.15);
  } catch { /* audio unavailable */ }
}

export function confetti(n = 60) {
  if (settings.get('motion') === 'off') return;
  const cols = ['#81b64c', '#f7c631', '#749bbf', '#fa412d', '#fff'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
    c.style.animationDelay = Math.random() * 0.6 + 's'; c.style.animationDuration = 1.4 + Math.random() * 1.4 + 's';
    document.body.appendChild(c); setTimeout(() => c.remove(), 3500);
  }
}

/** count-up animation for numbers */
export function countUp(el, to, { dec = 0, ms = 700 } = {}) {
  if (settings.get('motion') === 'off') { el.textContent = to.toFixed(dec); return; }
  const t0 = performance.now();
  const tick = (t) => { const p = Math.min(1, (t - t0) / ms); el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(dec); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

/** simple SVG line chart. points: number[]; opts: {w,h,color,labels,fill} */
export function lineChart(points, { w = 560, h = 160, color = '#81b64c', labels = [], fill = true, min, max, onPoint } = {}) {
  const lo = min ?? Math.min(...points), hi = max ?? Math.max(...points), pad = 24;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const y = (v) => h - pad - ((v - lo) / (hi - lo || 1)) * (h - pad * 2);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1)},${h - pad} L${x(0)},${h - pad} Z`;
  const len = Math.round(points.length * (w / points.length) * 1.4);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">
    ${[0, 0.5, 1].map((t) => `<line x1="${pad}" x2="${w - pad}" y1="${h - pad - t * (h - pad * 2)}" y2="${h - pad - t * (h - pad * 2)}" stroke="currentColor" opacity=".12"/>`).join('')}
    ${fill ? `<path d="${area}" fill="${color}" opacity=".12"/>` : ''}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" class="line-draw" style="--len:${len * 2}"/>
    ${points.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${color}"><title>${labels[i] ?? ''} ${v}</title></circle>`).join('')}
    ${labels.map((l, i) => (i % Math.ceil(labels.length / 6) === 0 ? `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${l}</text>` : '')).join('')}
  </svg>`;
}

export const piecesUnicode = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
