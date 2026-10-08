// Reusable puzzle widget (puzzles page, Blunder Box drills, daily test).
import { Chess } from '../../vendor/chess.js';
import { Board } from '../board.js';
import { $, $$, esc, sound, confetti } from '../ui.js';

/**
 * @returns {{board:Board, destroy:()=>void}}
 * opts: { threatStep:boolean, onDone:({correct,hints,ms,threats})=>void, size:'mid'|'' }
 */
export function mountPuzzle(root, p, opts = {}) {
  const chess = new Chess(p.fen);
  const side = chess.turn();
  let hints = 0, t0 = Date.now(), done = false, threats = [];
  root.innerHTML = `
    <div class="board-wrap" style="justify-content:center"><div id="pz-bd" class="${opts.size || ''}"></div></div>
    <div id="pz-msg" style="margin-top:12px"></div>`;
  const msg = $('#pz-msg', root);
  const board = new Board($('#pz-bd', root), {
    chess, orientation: side, interactive: (c) => !done && c === side && !locked(),
    onUserMove: (mv) => attempt(mv),
  });
  let phase = opts.threatStep ? 'threats' : 'solve';
  const locked = () => phase !== 'solve';

  const showThreatStep = () => {
    msg.innerHTML = `<div class="coach-card info"><h4>🛡 Safety Check first</h4><div class="small" style="margin-bottom:8px">Before you move, tick what you can see in this position.</div>
      <div class="check-list">
        <label><input type="checkbox" data-t="chk"> A check is available (for either side)</label>
        <label><input type="checkbox" data-t="cap"> A capture is available (for either side)</label>
        <label><input type="checkbox" data-t="thr"> One of the opponent's pieces is undefended</label>
      </div><button class="btn primary small" id="go" style="margin-top:8px">I've looked — let me move</button></div>`;
    $('#go', msg).onclick = () => { threats = $$('input:checked', msg).map((i) => i.dataset.t); phase = 'solve'; showSolve(); };
  };
  const showSolve = () => {
    msg.innerHTML = `<div class="row"><b>${side === 'w' ? 'White' : 'Black'} to move</b><span class="chip blue">${esc(p.theme)}</span><span class="chip">~${p.rating}</span><span class="grow"></span><button class="btn small ghost" id="hint">💡 Hint (<span id="hn">${hints}</span>/3)</button></div><div id="fb" style="margin-top:10px"></div>`;
    $('#hint', msg).onclick = () => {
      if (done) return; hints = Math.min(3, hints + 1);
      $('#hn', msg).textContent = hints;
      $('#fb', msg).innerHTML = `<div class="coach-card info"><h4>Hint ${hints}</h4><div class="small">${p.hints[hints - 1]}</div></div>`;
      if (hints === 3) { const sol = chess.moves({ verbose: true }).find((m) => m.san === p.solution[0]); sol && board.setArrows([[sol.from, sol.to, 'green']]); }
    };
  };
  const attempt = (mv) => {
    if (done) return false;
    const legal = chess.moves({ verbose: true }).find((m) => m.from === mv.from && m.to === mv.to && (!m.promotion || m.promotion === (mv.promotion || 'q')));
    if (!legal) return false;
    if (legal.san === p.solution[0]) {
      chess.move(legal); board.applyMove(legal); done = true; sound('good'); confetti(30);
      $('#fb', msg).innerHTML = `<div class="coach-card"><h4>✅ Correct: ${legal.san}</h4><div class="small">${p.idea}</div></div>`;
      opts.onDone && opts.onDone({ correct: true, hints, ms: Date.now() - t0, threats });
      return true;
    }
    sound('bad');
    // show the wrong move briefly then snap back
    chess.move(legal); board.applyMove(legal);
    setTimeout(() => { chess.undo(); board.render(); board.setLastMove(null); }, 650);
    $('#fb', msg).innerHTML = `<div class="coach-card bad"><h4>Not quite</h4><div class="small">${legal.san} doesn't do the job. Re-check: what is attacked, and what is protected? ${hints < 3 ? 'Use a hint if you are stuck.' : ''}</div></div>`;
    opts.onWrong && opts.onWrong();
    return true;
  };

  phase === 'threats' ? showThreatStep() : showSolve();
  return { board, giveUp() { if (done) return; done = true; const sol = chess.moves({ verbose: true }).find((m) => m.san === p.solution[0]); sol && board.setArrows([[sol.from, sol.to, 'green']]); opts.onDone && opts.onDone({ correct: false, hints, ms: Date.now() - t0, threats }); }, destroy() { done = true; } };
}
