import { Chess } from '../../vendor/chess.js';
import { Board } from '../board.js';
import { blunderCards, ladder, puzzles } from '../data.js';
import { mountPuzzle } from './_puzzle.js';
import { $, $$, esc, toast } from '../ui.js';

export function render(root) {
  const due = blunderCards.filter((c) => c.nextDue === 'Today');
  const list = () => {
    root.innerHTML = `
    <div class="page-h"><div><h1>Blunder Box</h1><p class="muted">Every blunder becomes a card. It returns after 1, 3, 7 and 21 days until you solve it cleanly three times.</p></div>
      <button class="btn primary big" id="go" ${due.length ? '' : 'disabled'}>Review ${due.length} due</button></div>
    <div class="grid g3 stagger" style="margin-bottom:16px"><div class="card stat"><div class="small muted">Due today</div><div class="v">${due.length}</div></div><div class="card stat"><div class="small muted">In the box</div><div class="v">${blunderCards.length}</div></div><div class="card stat"><div class="small muted">Cleared (3× clean)</div><div class="v">9</div></div></div>
    <section class="card"><h2>Your blunders</h2>${blunderCards.map((c) => `
      <div class="lesson-row" data-id="${c.id}" style="background:var(--panel2)"><div class="board small" style="--bs:64px;box-shadow:none;border-radius:4px;flex:none" data-fen="${c.fen}"></div>
        <div class="grow"><b>${c.title}</b><div class="small muted">${c.tag} · next: ${c.nextDue}</div>
          <div class="ladder" style="margin-top:6px;max-width:260px">${ladder.map((_, i) => `<i class="${i < c.step ? 'on' : ''}"></i>`).join('')}</div></div>
        <span class="chip ${c.nextDue === 'Today' ? 'red' : ''}">${c.nextDue}</span></div>`).join('')}</section>`;
    $$('[data-fen]', root).forEach((e) => new Board(e, { chess: new Chess(e.dataset.fen), coords: false, interactive: () => false, animate: false }));
    $('#go', root).onclick = () => drill(0);
    $$('.lesson-row', root).forEach((r) => r.onclick = () => drill(blunderCards.findIndex((c) => c.id === r.dataset.id)));
  };
  const drill = (idx) => {
    const c = blunderCards[idx];
    const p = puzzles.find((x) => x.fen === c.fen) || puzzles[0];
    root.innerHTML = `<div class="page-h"><div><a href="#/blunders" class="muted small">← Blunder Box</a><h1>${c.title}</h1></div><span class="chip yellow">${c.tag}</span></div>
      <div class="card" style="margin-bottom:12px"><div class="small muted">This is a position from <b>your own game</b>. The goal is to repair this exact mistake.</div></div><div id="pz"></div><div id="after"></div>`;
    mountPuzzle($('#pz', root), p, { threatStep: true, onDone: ({ correct, hints }) => {
      const next = correct && !hints ? 'moves up the ladder → returns in ' + ladder[Math.min(3, c.step)] : 'stays on the same step → returns tomorrow';
      $('#after', root).innerHTML = `<div class="coach-card ${correct && !hints ? '' : 'warn'}" style="margin-top:12px"><h4>${correct && !hints ? 'Clean solve' : 'Solved with help'}</h4><div class="small">This card ${next}.</div></div><button class="btn primary" id="n" style="margin-top:8px">${idx + 1 < blunderCards.length ? 'Next card' : 'Back to box'}</button>`;
      $('#n', root).onclick = () => { idx + 1 < blunderCards.length ? drill(idx + 1) : (location.hash = '#/blunders', list()); };
    } });
  };
  list();
}
