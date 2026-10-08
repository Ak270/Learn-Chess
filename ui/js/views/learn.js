import { Chess } from '../../vendor/chess.js';
import { Board } from '../board.js';
import { roadmap, lessons } from '../data.js';
import { $, $$, esc, toast, confetti } from '../ui.js';

export function render(root, { args }) {
  if (args[0]) return lesson(root, args[0]);
  root.innerHTML = `
  <div class="page-h"><div><h1>Learn</h1><p class="muted">One idea at a time. A phase unlocks when your own games show the habit, not when a quiz is passed.</p></div><span class="chip green">Phase 1 of 7</span></div>
  <div class="grid g2" style="align-items:start">
    <section class="road stagger">${roadmap.map((n) => `
      <div class="node ${n.state}"><div class="dotn">${n.state === 'locked' ? '🔒' : n.id}</div>
        <div class="card"><div class="row"><h3 class="grow" style="margin:0">${n.title}</h3>${n.state === 'current' ? '<span class="chip green">In progress</span>' : n.state === 'next' ? '<span class="chip blue">Up next</span>' : ''}</div>
        <div class="bar" style="margin:10px 0"><i style="width:${n.pct}%"></i></div>
        <div class="row" style="flex-wrap:wrap;gap:6px">${n.skills.map((s) => `<span class="chip">${s}</span>`).join('')}</div></div></div>`).join('')}</section>
    <section><h2>Lessons</h2>
      ${lessons.map((l) => `<div class="lesson-row ${l.state}" data-id="${l.id}"><span class="avatar" style="background:${l.state === 'done' ? 'var(--accent)' : 'var(--panel2)'};color:${l.state === 'done' ? 'var(--accent-ink)' : 'inherit'}">${l.state === 'done' ? '✓' : l.state === 'locked' ? '🔒' : '▶'}</span>
        <div class="grow"><b>${l.title}</b><div class="small muted">Phase ${l.phase} · ${l.min} min${l.state === 'current' ? ' · recommended today' : ''}</div></div>${l.state === 'new' ? '<span class="chip yellow">New</span>' : ''}</div>`).join('')}
      <p class="proto" style="margin-top:12px">Real lessons are authored by us, checked with the engine, and written for a 600→1000 learner. See docs/curriculum.</p>
    </section>
  </div>`;
  $$('.lesson-row', root).forEach((r) => r.onclick = () => { location.hash = '#/learn/' + r.dataset.id; });
}

function lesson(root) {
  const chess = new Chess('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  const steps = [
    { t: 'Why this matters', body: 'Most beginner games are decided by a free piece. A piece is <b>undefended</b> when nothing of its own side can recapture on that square. Capturing an undefended piece costs you nothing.', arrows: [] },
    { t: 'Look at the board', body: 'Black\'s queen on d5 is attacked by your rook on d1. Ask: <b>is anything protecting it?</b> Black\'s king on e8 is too far away. Nothing defends the queen.', arrows: [['d1', 'd5', 'red']] },
    { t: 'The habit', body: 'Before every move: (1) what is attacked, (2) what is protected, (3) what can they capture next? Say it out loud — it becomes automatic.', arrows: [['e8', 'd5', 'blue']] },
    { t: 'Your turn', body: 'Take the free queen. Drag the rook or click it, then click d5.', arrows: [], play: true },
  ];
  let s = 0, got = false;
  const paint = () => {
    const st = steps[s];
    root.innerHTML = `
    <div class="page-h"><div><a href="#/learn" class="muted small">← Learn</a><h1>Undefended pieces</h1></div><div class="row"><span class="chip">${s + 1} / ${steps.length}</span></div></div>
    <div class="bar" style="max-width:640px;margin-bottom:16px"><i style="width:${((s + 1) / steps.length) * 100}%"></i></div>
    <div class="game" style="grid-template-columns:auto 1fr"><div id="bd" class="mid" style="--bs:min(520px,86vw)"></div>
      <div class="card" style="max-width:460px"><h2>${st.t}</h2><p>${st.body}</p><div id="fb"></div>
        <div class="row" style="margin-top:16px"><button class="btn" id="prev" ${s === 0 ? 'disabled' : ''}>Back</button><button class="btn primary" id="next" ${st.play && !got ? 'disabled' : ''}>${s === steps.length - 1 ? 'Finish lesson' : 'Next'}</button></div></div></div>`;
    const board = new Board($('#bd', root), { chess, orientation: 'w', interactive: () => !!st.play && !got, onUserMove: (mv) => {
      const m = chess.moves({ verbose: true }).find((x) => x.from === mv.from && x.to === mv.to);
      if (!m) return false;
      if (m.san !== 'Rxd5') { $('#fb', root).innerHTML = '<div class="coach-card bad"><h4>Not that one</h4><div class="small">Look at what is attacked and unprotected.</div></div>'; return false; }
      chess.move(m); board.applyMove(m); got = true; confetti(25);
      $('#fb', root).innerHTML = '<div class="coach-card"><h4>✅ Rxd5 wins the queen</h4><div class="small">Nothing could recapture. That is the whole lesson.</div></div>'; $('#next', root).disabled = false; return true;
    } });
    board.setArrows(st.arrows);
    $('#prev', root).onclick = () => { s--; paint(); };
    $('#next', root).onclick = () => { if (s === steps.length - 1) { toast('Lesson complete. 8 drills unlocked.'); location.hash = '#/learn'; } else { s++; paint(); } };
  };
  paint();
}
