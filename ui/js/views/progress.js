import { skills, blunderTrend, ratingTrend, roadmap, user } from '../data.js';
import { lineChart, $$, countUp } from '../ui.js';

export function render(root) {
  const heat = ['Opening', 'Middlegame', 'Endgame'].map((p) => `<div class="small muted">${p}</div>` + ['Hanging', 'Threats', 'Forks', 'Pins', 'Mates'].map(() => { const v = Math.random(); return `<div title="sample" style="height:34px;border-radius:6px;background:rgba(250,65,45,${(0.15 + v * 0.7).toFixed(2)})"></div>`; }).join('')).join('');
  root.innerHTML = `
  <div class="page-h"><div><h1>Progress</h1><p class="muted">Behaviour first, rating second. Rating is slow and noisy; blunders and missed threats move first.</p></div><span class="proto">Sample data</span></div>
  <div class="grid stagger">
    <div class="grid g2">
      <section class="card"><div class="row"><h2 class="grow">Blunders per game</h2><span class="chip green">−33% in 8 weeks</span></div>${lineChart(blunderTrend, { color: '#fa412d', h: 170, labels: blunderTrend.map((_, i) => `W${i + 1}`) })}</section>
      <section class="card"><div class="row"><h2 class="grow">Rating</h2><span class="chip">goal ${user.goal}</span></div>${lineChart(ratingTrend, { h: 170, labels: ratingTrend.map((_, i) => `W${i + 1}`) })}</section>
    </div>
    <div class="grid g2">
      <section class="card"><h2>Skill profile</h2>${skills.map((s) => `<div class="skillrow"><span>${s.name}</span><div class="bar"><i style="width:${s.v}%"></i></div><span class="small ${s.trend.startsWith('+') ? '' : 'muted'}" style="${s.trend.startsWith('+') ? 'color:var(--accent)' : ''}">${s.trend}</span></div>`).join('')}
        <p class="small muted">Each bar combines concept, recognition, unaided success and real-game transfer — never a single quiz score.</p></section>
      <section class="card"><h2>Where mistakes happen</h2><div style="display:grid;grid-template-columns:90px repeat(5,1fr);gap:6px;align-items:center"><div></div>${['Hanging', 'Threats', 'Forks', 'Pins', 'Mates'].map((x) => `<div class="small muted" style="text-align:center">${x}</div>`).join('')}${heat}</div></section>
    </div>
    <section class="card"><h2>Phase gates</h2><p class="small muted">Decided at the monthly check-up from evidence in your games.</p>
      <div class="grid g2">${roadmap.slice(0, 2).map((r) => `<div class="card flat"><b>Phase ${r.id}: ${r.title}</b><div class="bar" style="margin:8px 0"><i style="width:${r.pct}%"></i></div>
        ${['Unprompted threat statements in 70% of coach-mode moves', 'Hanging-piece blunders under 1.5 per game for 5 games', 'Blunder Box 3× clean on last 10 cards'].map((c, i) => `<div class="small">${i < (r.id === 1 ? 2 : 0) ? '✅' : '⬜'} ${c}</div>`).join('')}</div>`).join('')}</div>
      <p class="proto" style="margin-top:10px">Thresholds shown are examples; real values are configurable and judged with several signals together.</p></section>
  </div>`;
}
