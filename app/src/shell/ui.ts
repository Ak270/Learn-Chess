// Shared UI helpers ported from the prototype (ui/js/ui.js): sound, confetti, count-up, line chart, class palette.
import type { MoveClass } from '../types/model';
import { settings } from './settings';

let ac: AudioContext | undefined;
export function sound(kind: 'move' | 'capture' | 'check' | 'bad' | 'good' = 'move') {
  if (!settings.get('sound')) return;
  try {
    ac =
      ac ||
      new (
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = { move: 520, capture: 340, check: 780, bad: 160, good: 880 }[kind] || 500;
    o.frequency.value = f;
    o.type = kind === 'capture' ? 'square' : 'triangle';
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.14);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.15);
  } catch {
    /* audio unavailable */
  }
}

const reduced = () => settings.get('motion') === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function confetti(n = 60) {
  if (reduced()) return;
  const cols = ['#81b64c', '#f7c631', '#749bbf', '#fa412d', '#fff'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cols[i % cols.length];
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.animationDuration = 1.4 + Math.random() * 1.4 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3500);
  }
}

export function countUp(el: HTMLElement, to: number, { dec = 0, ms = 700 } = {}) {
  if (reduced()) {
    el.textContent = to.toFixed(dec);
    return;
  }
  const t0 = performance.now();
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(dec);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface ChartOpts {
  w?: number;
  h?: number;
  color?: string;
  labels?: (string | number)[];
  fill?: boolean;
  min?: number;
  max?: number;
  /** adds a data-i attribute to each point so views can make the chart clickable */
  clickable?: boolean;
  markIndex?: number;
  ariaLabel?: string;
}
export function lineChart(points: number[], o: ChartOpts = {}) {
  const { w = 560, h = 160, color = '#81b64c', labels = [], fill = true } = o;
  const lo = o.min ?? Math.min(...points);
  const hi = o.max ?? Math.max(...points);
  const pad = 24;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => h - pad - ((v - lo) / (hi - lo || 1)) * (h - pad * 2);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1)},${h - pad} L${x(0)},${h - pad} Z`;
  const len = Math.round(points.length * (w / points.length) * 1.4);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${o.ariaLabel ?? 'chart'}">
    ${[0, 0.5, 1].map((t) => `<line x1="${pad}" x2="${w - pad}" y1="${h - pad - t * (h - pad * 2)}" y2="${h - pad - t * (h - pad * 2)}" stroke="currentColor" opacity=".12"/>`).join('')}
    ${fill ? `<path d="${area}" fill="${color}" opacity=".12"/>` : ''}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" class="line-draw" style="--len:${len * 2}"/>
    ${points.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${o.markIndex === i ? 7 : 4}" fill="${o.markIndex === i ? '#fa412d' : color}" ${o.clickable ? `data-i="${i}" style="cursor:pointer"` : ''}><title>${labels[i] ?? ''} ${Math.round(v * 10) / 10}</title></circle>`).join('')}
    ${labels.map((l, i) => (i % Math.ceil(labels.length / 6) === 0 ? `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${l}</text>` : '')).join('')}
  </svg>`;
}

export const classMeta: Record<MoveClass, { label: string; sym: string; color: string }> = {
  brilliant: { label: 'Brilliant', sym: '!!', color: '#26c2a3' },
  great: { label: 'Great', sym: '!', color: '#749bbf' },
  best: { label: 'Best', sym: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', sym: '👍', color: '#81b64c' },
  good: { label: 'Good', sym: '✓', color: '#95b776' },
  book: { label: 'Book', sym: '📖', color: '#a88865' },
  inaccuracy: { label: 'Inaccuracy', sym: '?!', color: '#f7c631' },
  mistake: { label: 'Mistake', sym: '?', color: '#ffa459' },
  miss: { label: 'Miss', sym: '✕', color: '#ff7769' },
  blunder: { label: 'Blunder', sym: '??', color: '#fa412d' },
};
