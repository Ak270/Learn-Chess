// Model games (docs/backend/06 §7): replay a master game, pausing to ask the Safety-Check questions as the master would.
// Scored on reasoning categories considered, not on guessing the exact move.
import { Chess } from 'chess.js';
import games from '../content/modelGames.json';
import { store } from '../app';
import { Board } from '../components/BoardApi';
import { evidenceFromAttempt } from '../core/skills/derive';
import type { SkillId } from '../types/ids';
import { $, $$, esc } from '../shell/dom';

const CATS: [string, string][] = [
  ['threats', 'What is attacked? What do they threaten?'],
  ['checks', 'Is there a check?'],
  ['captures', 'Is there a capture, and is it safe?'],
  ['candidates', 'Did I find two or three candidate moves?'],
];

export function listModelGames() {
  return games.games.map((g) => ({ id: g.id, title: g.title, sub: `${g.white} vs ${g.black}, ${g.where}` }));
}

export function renderModelGame(root: HTMLElement, id: string) {
  const g = games.games.find((x) => x.id === id);
  if (!g) {
    root.innerHTML = '<div class="page-h"><div><h1>Game not found</h1><a href="#/learn">Back</a></div></div>';
    return;
  }
  const full = new Chess();
  full.loadPgn(g.pgn);
  const moves = full.history({ verbose: true });
  const chess = new Chess();
  let ply = 0;
  let pauseIdx = 0;
  let paused = false;
  root.innerHTML = `<div class="page-h"><div><a href="#/learn" class="muted small">← Learn</a><h1>${esc(g.title)}</h1><p class="muted">${esc(g.white)} vs ${esc(g.black)}, ${esc(g.where)}</p></div></div>
    <div class="game" style="grid-template-columns:auto 1fr"><div id="bd" class="mid" style="--bs:min(520px,86vw)"></div>
    <div class="card" style="max-width:520px"><div id="msg"><p class="muted">Step through the game. At some moves the game pauses and asks you what you notice, the way a strong player would.</p></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="prev">◀</button><button class="btn primary" id="next">Next move ▶</button></div><p class="small muted" id="mv"></p></div></div>`;
  const board = new Board($('#bd', root), { chess, orientation: 'w', interactive: () => false });
  const sync = () => {
    $('#mv', root).textContent = chess.history().join(' ');
  };
  const pauseHere = () => g.pauses.find((p) => p.ply === ply);
  const ask = () => {
    const p = pauseHere();
    if (!p) return false;
    paused = true;
    $('#msg', root).innerHTML =
      `<h3>Pause</h3><p>${esc(p.prompt)}</p><fieldset style="border:0;padding:0"><legend class="small muted">Tick what you considered</legend>${CATS.map(([k, l]) => `<label style="display:block;margin:4px 0"><input type="checkbox" data-c="${k}"> ${esc(l)}</label>`).join('')}</fieldset>
      <label for="guess" class="small muted">Your move (optional)</label><input id="guess" type="text" style="width:140px"><div class="row" style="margin-top:8px"><button class="btn primary" id="rev">Show what happened</button></div>`;
    $('#rev', root).onclick = async () => {
      const ticked = $$<HTMLInputElement>('input[data-c]:checked', root).map((i) => i.dataset.c!);
      const hit = p.ideas.filter((i) => ticked.includes(i)).length;
      const score = hit / p.ideas.length;
      const attempt = {
        at: Date.now(),
        context: 'game_prompt' as const,
        correct: score >= 0.5,
        hints: 0,
        ms: 0,
        skillTags: [g.skill as SkillId],
        source: 'critical_drill' as const,
      };
      await store.recordAttempt(attempt, evidenceFromAttempt({ ...attempt, id: '' }));
      paused = false;
      $('#msg', root).innerHTML =
        `<div class="coach-card ${score >= 0.5 ? '' : 'info'}"><h4>${score >= 1 ? 'You covered what matters' : score >= 0.5 ? 'Good start' : 'Worth looking at again'}</h4><div class="small">You considered ${hit} of the ${p.ideas.length} things that matter here: ${p.ideas.map((i) => esc(i)).join(', ')}.</div></div><div class="coach-card"><h4>What happened</h4><div class="small">${esc(p.reveal)}</div></div>`;
      pauseIdx++;
    };
    return true;
  };
  const step = (dir: 1 | -1) => {
    if (paused) return;
    if (dir === 1 && ply < moves.length) {
      const m = chess.move(moves[ply].san);
      board.applyMove(m);
      ply++;
      if (!ask() && ply === moves.length)
        $('#msg', root).innerHTML =
          `<div class="coach-card"><h4>Game over</h4><div class="small">${esc(g.title)} ended in checkmate. You looked at ${pauseIdx} pause${pauseIdx === 1 ? '' : 's'}.</div></div>`;
    } else if (dir === -1 && ply > 0) {
      chess.undo();
      ply--;
      board.render();
      $('#msg', root).innerHTML = '';
    }
    sync();
  };
  $('#next', root).onclick = () => step(1);
  $('#prev', root).onclick = () => step(-1);
  sync();
}
