import { user, sessionBlocks, stats, ratingTrend, recentGames, teacherNotes } from '../data.js';
import { $, $$, esc, lineChart, countUp } from '../ui.js';

export function render(root) {
  const done = sessionBlocks.filter((b) => b.done).length;
  const pct = Math.round((done / sessionBlocks.length) * 100);
  const next = sessionBlocks.find((b) => !b.done);
  root.innerHTML = `
  <div class="page-h"><div><h1>Good evening, ${esc(user.name)}</h1><p class="muted">${user.level} · focus this week: <b>${user.focusSkill}</b></p></div>
    <div class="row"><span class="chip yellow"><span class="flame">🔥</span> ${user.streak}-day streak</span><span class="chip blue">❄️ ${user.freezeDays} freeze day</span></div></div>
  <div class="grid stagger">
    <section class="hero">
      <div class="ring" style="--p:0" id="ring"><b>${pct}%</b></div>
      <div class="grow"><h2 style="font-size:24px">Today's session</h2>
        <p class="muted" style="color:inherit;opacity:.8">${done} of ${sessionBlocks.length} blocks done · about ${sessionBlocks.filter((b) => !b.done).reduce((a, b) => a + b.min, 0)} minutes left</p>
        <a class="btn primary big" href="#/session">${done ? 'Continue' : 'Start'}: ${next.title}</a>
        <a class="btn ghost" style="margin-left:8px" href="#/session">Light day (15 min)</a></div>
    </section>
    <div class="grid g4">${stats.map((s, i) => {
      const better = (s.good === 'down') === (s.value < s.prev);
      return `<div class="card stat"><div class="small muted">${s.label}</div><div class="v"><span data-n="${s.value}" data-d="${s.value % 1 ? 1 : 0}">0</span>${s.unit}</div>
      <div class="delta ${better ? 'up' : 'dn'}">${better ? '▲ improving' : '▼ slipping'} <span class="muted">(was ${s.prev}${s.unit})</span></div></div>`;
    }).join('')}</div>
    <div class="grid g2">
      <section class="card"><div class="row"><h2 class="grow">Today's plan</h2><span class="chip">${sessionBlocks.reduce((a, b) => a + b.min, 0)} min</span></div>
        <div class="steps">${sessionBlocks.map((b) => `<a class="step ${b.done ? 'done' : b === next ? 'cur' : ''}" href="#/session" style="text-decoration:none"><span class="ic">${b.icon}</span><div><b>${b.title}</b> <span class="muted small">· ${b.min} min</span><div class="small muted">${b.desc}</div></div><span class="tick">${b.done ? '✓' : ''}</span></a>`).join('')}</div></section>
      <div class="grid" style="align-content:start">
        <section class="card"><div class="row"><h2 class="grow">Rating</h2><span class="chip green">+52 this month</span></div>
          <div class="row" style="align-items:baseline"><div class="v" style="font-size:36px;font-weight:800">${user.rating}</div><span class="muted">goal ${user.goal}</span></div>
          ${lineChart(ratingTrend, { h: 120, labels: ratingTrend.map((_, i) => `W${i + 1}`) })}
          <div class="bar" style="margin-top:6px"><i style="width:${Math.round(((user.rating - 600) / (user.goal - 600)) * 100)}%"></i></div><div class="small muted" style="margin-top:4px">${Math.round(((user.rating - 600) / (user.goal - 600)) * 100)}% of the way from 600 to ${user.goal}</div></section>
        <section class="card" style="border-left:4px solid var(--accent)"><h3>💬 Note from Mentor</h3>${teacherNotes.map((n) => `<p class="small" style="margin-bottom:6px">• ${n}</p>`).join('')}</section>
      </div>
    </div>
    <section class="card"><div class="row"><h2 class="grow">Recent games & first meaningful mistake</h2><a class="btn small ghost" href="#/review">Open review</a></div>
      <div class="glist">${recentGames.map((g) => `<div class="it" data-go="review"><span class="res ${g.result}">${g.result === 'win' ? 'W' : 'L'}</span><div class="grow"><b>vs ${g.opp}</b> <span class="muted small">· ${g.date} · accuracy ${g.acc}%</span><div class="small muted">${g.firstMistake}</div></div><span class="chip ${g.tag === 'Rushed' ? 'yellow' : 'red'}">${g.tag}</span></div>`).join('')}</div></section>
  </div>`;
  requestAnimationFrame(() => {
    $('#ring', root).style.setProperty('--p', pct);
    $$('[data-n]', root).forEach((e) => countUp(e, +e.dataset.n, { dec: +e.dataset.d }));
  });
  $$('[data-go]', root).forEach((e) => e.addEventListener('click', () => { location.hash = '#/' + e.dataset.go; }));
}
