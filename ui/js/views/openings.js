import { Chess } from '../../vendor/chess.js';
import { Board } from '../board.js';
import { openings, leftBook } from '../data.js';
import { $, $$, esc, toast, sound } from '../ui.js';

export function render(root) {
  const list = () => {
    root.innerHTML = `
    <div class="page-h"><div><h1>Openings</h1><p class="muted">A tiny repertoire you understand beats a big one you forget. Every card carries the move <i>and</i> the reason.</p></div><span class="proto">Placeholder lines — you choose the real repertoire</span></div>
    <div class="grid g2" style="align-items:start">
      <section class="grid stagger">${openings.map((o) => `
        <div class="card"><div class="row"><span class="chip ${o.side === 'White' ? '' : 'blue'}">${o.side}</span><h3 class="grow" style="margin:0">${o.name}</h3>${o.due ? `<span class="chip red">${o.due} due</span>` : '<span class="chip green">up to date</span>'}</div>
        <div class="small muted" style="margin:8px 0">Understanding mastery</div><div class="bar"><i style="width:${o.mastery}%"></i></div>
        <div class="row" style="margin-top:12px"><button class="btn primary small" data-drill="${o.id}">${o.due ? 'Review due cards' : 'Practise anyway'}</button><button class="btn small ghost">Explore line</button></div></div>`).join('')}</section>
      <div class="grid" style="align-content:start">
        <section class="card"><h3>📍 Where you left your book</h3>${leftBook.map((b) => `<div class="coach-card warn"><div class="small">${b.text}</div><button class="btn small" style="margin-top:6px">Make a card</button></div>`).join('')}</section>
        <section class="card"><h3>How cards are scheduled</h3><p class="small muted">Each card returns on a spaced schedule. Fail it, and it comes back sooner. Cards with no "why" are never created.</p>
          <div class="ladder"><i class="on"></i><i class="on"></i><i></i><i></i></div><div class="row small muted" style="justify-content:space-between"><span>1d</span><span>3d</span><span>7d</span><span>21d</span></div></section>
      </div></div>`;
    $$('[data-drill]', root).forEach((b) => b.onclick = () => drill(openings.find((o) => o.id === b.dataset.drill)));
  };

  const drill = (o) => {
    const chess = new Chess();
    let i = 0, reveal = false;
    const myTurn = (idx) => (o.side === 'White' ? idx % 2 === 0 : idx % 2 === 1);
    const paint = () => {
      root.innerHTML = `
      <div class="page-h"><div><a href="#/openings" class="muted small">← Openings</a><h1>${o.name}</h1></div><span class="chip">${Math.min(i + 1, o.line.length)} / ${o.line.length}</span></div>
      <div class="game" style="grid-template-columns:auto 1fr"><div id="bd" style="--bs:min(520px,86vw)"></div>
        <div class="card" style="max-width:440px"><h3>Your move as ${o.side}</h3><div id="q"></div><div id="fb"></div></div></div>`;
      const board = new Board($('#bd', root), { chess, orientation: o.side === 'White' ? 'w' : 'b',
        interactive: () => i < o.line.length && myTurn(i),
        onUserMove: (mv) => {
          const m = chess.moves({ verbose: true }).find((x) => x.from === mv.from && x.to === mv.to);
          if (!m) return false;
          if (m.san !== o.line[i]) { $('#fb', root).innerHTML = `<div class="coach-card bad"><h4>Not the book move</h4><div class="small">Think about the idea: ${o.why[i] ? 'what does this move aim at?' : 'what does the position need?'}</div></div>`; sound('bad'); return false; }
          chess.move(m); board.applyMove(m); sound('move'); $('#fb', root).innerHTML = `<div class="coach-card"><h4>✅ ${m.san}</h4><div class="small">${o.why[i] || ''}</div></div>`;
          i++; setTimeout(advance, 700); return true;
        } });
      const advance = () => {
        if (i >= o.line.length) { $('#q', root).innerHTML = '<p>Line complete. <b>Rate how it felt</b> so the next review is scheduled:</p><div class="conf"><button class="btn" data-r="again">Forgot</button><button class="btn" data-r="hard">Hard</button><button class="btn" data-r="good">Good</button><button class="btn" data-r="easy">Easy</button></div>'; $$('[data-r]', root).forEach((b) => b.onclick = () => { toast(`Scheduled: ${({ again: 'tomorrow', hard: 'in 2 days', good: 'in 6 days', easy: 'in 14 days' })[b.dataset.r]}`); location.hash = '#/openings'; }); return; }
        if (!myTurn(i)) { const m = chess.move(o.line[i]); board.applyMove(m); i++; $('#fb', root).innerHTML += `<div class="small muted">Opponent plays ${m.san}.</div>`; }
        $('#q', root).innerHTML = `<p>Play the next move of your line.</p><p class="small muted">Then say <b>why</b> to yourself before the explanation appears.</p>`;
      };
      advance();
    };
    paint();
  };
  list();
}
