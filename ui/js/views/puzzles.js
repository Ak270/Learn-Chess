import { puzzles } from '../data.js';
import { mountPuzzle } from './_puzzle.js';
import { $, $$, esc, toast } from '../ui.js';

export function render(root) {
  let i = 0, solved = 0, streak = 0, rating = 520;
  const themes = ['All themes', 'Hanging piece', 'Fork', 'Back-rank mate', 'Pin', 'Skewer', 'Discovered attack'];
  const paint = () => {
    const p = puzzles[i % puzzles.length];
    root.innerHTML = `
    <div class="page-h"><div><h1>Puzzles</h1><p class="muted">Solve slowly and completely. State what you see first. Speed comes later.</p></div>
      <div class="row"><span class="chip yellow">🔥 streak ${streak}</span><span class="chip green">${solved} solved</span><span class="chip">puzzle rating ${rating}</span></div></div>
    <div class="game" style="grid-template-columns:auto 1fr">
      <div id="pz" style="min-width:min(560px,100%)"></div>
      <aside class="side"><div class="body">
        <h3>Training set</h3><select id="theme">${themes.map((t) => `<option>${t}</option>`).join('')}</select>
        <p class="small muted" style="margin-top:8px">Real build: a personal Woodpecker-style set of 100–300 positions drawn from the CC0 Lichess puzzle database, repeated in faster cycles. Your own misses are added automatically.</p>
        <div class="coach-card info" style="margin-top:12px"><h4>Cycle 1 · set "Hanging pieces & forks"</h4><div class="bar"><i style="width:${Math.round(((i % puzzles.length) / puzzles.length) * 100)}%"></i></div><div class="small muted" style="margin-top:6px">${(i % puzzles.length) + 1} / ${puzzles.length} · target 90% accuracy before cycle 2</div></div>
        <div id="after"></div></div>
        <div class="ctrls"><button class="btn" id="skip">Skip</button><button class="btn" id="show">Show solution</button></div></aside>
    </div>`;
    const w = mountPuzzle($('#pz', root), p, {
      threatStep: true,
      onDone: ({ correct, hints }) => {
        if (correct) { solved++; streak++; rating += hints ? 4 : 12; toast(hints ? 'Solved with hints — it will come back sooner.' : 'Solved cleanly. +12', ''); }
        else { streak = 0; rating -= 8; }
        $('#after', root).innerHTML = `<button class="btn primary big" id="next" style="margin-top:12px;width:100%">Next puzzle →</button>`;
        $('#next', root).onclick = () => { i++; paint(); };
      },
      onWrong: () => { streak = 0; },
    });
    $('#skip', root).onclick = () => { i++; paint(); };
    $('#show', root).onclick = () => w.giveUp();
  };
  paint();
}
