import { Chess } from '../../vendor/chess.js';
import { Board } from '../board.js';
import { sampleGame, classMeta, diagnosis, firstMistakePly } from '../data.js';
import { $, $$, esc, lineChart, sound, toast, settings } from '../ui.js';
import { fenBeforeBlunder } from '../data.js';
import { principalLine } from '../bot.js';
import { lineFacts, buildPackage } from '../facts.js';
import { explain } from '../groq.js';

export function render(root) {
  const g = sampleGame;
  const chess = new Chess();
  const verbose = [];
  for (const s of g.moves) verbose.push(chess.move(s));
  chess.reset();
  let ply = 0; // number of plies played
  const counts = {};
  g.cls.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
  const badge = (c) => `<span class="cl" style="background:${classMeta[c].color};${c === 'good' || c === 'best' || c === 'excellent' ? 'color:#10200a' : ''}">${classMeta[c].sym}</span>`;

  root.innerHTML = `
  <div class="page-h"><div><h1>Game Review</h1><p class="muted">${g.white} vs ${g.black} · ${g.result} · Rook Rita (1000)</p></div><span class="proto">Prototype: classifications and eval are sample data</span></div>
  <div class="game">
    <div class="game-main">
      <div class="playerbar"><div class="avatar">♜</div><span class="nm">${g.black}</span></div>
      <div class="board-wrap"><div class="eval-bar" id="evb"></div><div id="bd"></div></div>
      <div class="playerbar"><div class="avatar">🧑</div><span class="nm">${g.white}</span>
        <span class="grow"></span><button class="btn small" id="p-start">⏮</button><button class="btn small" id="p-prev">◀</button><button class="btn small" id="p-play">▶ Play</button><button class="btn small" id="p-next">▶</button><button class="btn small" id="p-end">⏭</button></div>
    </div>
    <aside class="side" style="max-height:none">
      <div class="body">
        <div class="coach-card info blindcard" id="blindcard"><h4>🔎 Find it yourself first</h4>
          <div class="small">Eval, badges and best moves are hidden. Step through the game (◀ ▶ or click a move) and stop at the move you think was <b>your first big mistake</b>.</div>
          <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn small primary" id="pick">That was it — this move</button><button class="btn small ghost" id="nopick">I don't see one</button><button class="btn small ghost" id="showme">Skip: show me</button></div><div id="pickres"></div></div>
        <div class="coach-card bad spoil" id="mist"><h4>🎯 First meaningful mistake · move ${Math.ceil(firstMistakePly / 2)}</h4>
          <div class="small"><b>11. Nh4??</b> left the knight on h4 attacked by the queen on f6 and unprotected. The game turned here: evaluation went from <b>−0.2</b> to <b>−3.4</b>.</div>
          <div class="row" style="margin-top:8px"><button class="btn small primary" id="jump">Show me the position</button></div></div>
        <div class="coach-card spoil" id="after"><h4>🔮 What happens after 11. Nh4?</h4><div class="small" id="after-t"></div>
          <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn small" id="ai">✨ Explain in plain English (Groq)</button><span class="small muted" id="ai-s">Facts above are computed by chess code, not AI.</span></div><div class="small" id="ai-t" style="margin-top:8px"></div></div>
        <div class="coach-card info spoil"><h4>❓ Your turn, before I explain</h4><div class="small" style="margin-bottom:8px">What were you aiming for with Nh4?</div>
          <textarea id="why" rows="2" placeholder="e.g. I wanted to attack the bishop on g6"></textarea>
          <button class="btn small" id="save-why" style="margin-top:8px">Save and reveal diagnosis</button></div>
        <div id="diag" class="spoil"></div>
        <div class="spoil"><h3 style="margin-top:14px">Accuracy</h3>
        <div class="grid g3" style="gap:8px"><div class="card flat"><div class="small muted">You</div><div style="font-size:26px;font-weight:800">61%</div></div><div class="card flat"><div class="small muted">Opening</div><b class="chip green">Solid</b></div><div class="card flat"><div class="small muted">Middlegame</div><b class="chip red">Costly</b></div></div>
        <h3 style="margin-top:14px">Move quality</h3>
        <div class="row" style="flex-wrap:wrap;gap:6px">${Object.entries(counts).map(([c, n]) => `<span class="chip" style="background:${classMeta[c].color}33">${classMeta[c].sym} ${classMeta[c].label} ${n}</span>`).join('')}</div>
        <h3 style="margin-top:14px">Evaluation</h3><div id="graph"></div></div>
        <h3 style="margin-top:14px">Moves</h3><div class="moves" id="mv"></div>
      </div>
      <div class="ctrls"><a class="btn primary" href="#/blunders">📦 Add to Blunder Box</a><a class="btn" href="#/play">Play this position</a></div>
    </aside>
  </div>`;

  const board = new Board($('#bd', root), { chess, orientation: 'w', interactive: () => false });
  const evb = $('#evb', root);
  const paintEval = () => { const e = g.evals[ply] ?? 0; const pct = 50 + Math.max(-48, Math.min(48, e * 7)); evb.innerHTML = `<div class="w" style="height:${pct}%"></div><span class="top">${e < 0 ? Math.abs(e).toFixed(1) : ''}</span><span class="bot">${e > 0 ? e.toFixed(1) : ''}</span>`; };
  const paintMoves = () => {
    let h = '';
    for (let i = 0; i < g.moves.length; i += 2) {
      h += `<div class="n">${i / 2 + 1}</div>` + [i, i + 1].map((j) => (g.moves[j] ? `<div class="m ${ply - 1 === j ? 'cur' : ''}" data-i="${j}">${g.moves[j]}${badge(g.cls[j])}</div>` : '<div></div>')).join('');
    }
    $('#mv', root).innerHTML = h;
    $$('#mv .m', root).forEach((e) => e.onclick = () => go(+e.dataset.i + 1));
    const cur = $('#mv .cur', root); cur && cur.scrollIntoView({ block: 'nearest' });
  };
  const paintGraph = () => {
    $('#graph', root).innerHTML = lineChart(g.evals.map((v) => Math.max(-8, Math.min(8, v))), { h: 140, min: -8, max: 8, color: '#749bbf', labels: g.evals.map((_, i) => (i ? Math.ceil(i / 2) : '')) })
      + `<div class="small muted">Click a move below to jump. Dip at move 11 marks the first meaningful mistake.</div>`;
  };
  const go = (n, quiet) => {
    n = Math.max(0, Math.min(g.moves.length, n));
    const prev = ply;
    if (n === prev + 1 && !quiet) { board.chess = chess; chess.move(g.moves[prev]); board.applyMove(verbose[prev]); }
    else { chess.reset(); for (let i = 0; i < n; i++) chess.move(g.moves[i]); board.render(); board.setLastMove(n ? verbose[n - 1] : null); }
    ply = n;
    const m = n ? verbose[n - 1] : null, c = n ? g.cls[n - 1] : null;
    board.setMarks(m && !['book', 'good', 'best', 'excellent'].includes(c) ? { [m.to]: { text: classMeta[c].sym, badgeColor: classMeta[c].color } } : m ? { [m.to]: { text: classMeta[c].sym, badgeColor: classMeta[c].color } } : {});
    board.setArrows(n === firstMistakePly ? [['f6', 'h4', 'red']] : []);
    if (c === 'blunder') sound('bad');
    paintEval(); paintMoves();
  };
  const setBlind = (on) => { root.classList.toggle('blind', on); $('#blindcard', root).style.display = on ? '' : 'none'; };
  setBlind(true);
  const reveal = (pickedPly) => {
    const truth = firstMistakePly; setBlind(false);
    const d = pickedPly == null ? null : Math.abs(pickedPly - truth);
    const msg = pickedPly == null ? `You did not spot one. The first big mistake was move ${Math.ceil(truth / 2)} (${g.moves[truth - 1]}). That is useful to know — we will practise finding these.`
      : d === 0 ? 'Exactly right. You found the first big mistake yourself.' : d <= 2 ? `Very close — you picked ply ${pickedPly}, it was ply ${truth} (${g.moves[truth - 1]}). The damage started one move earlier.`
      : `You picked move ${Math.ceil(pickedPly / 2)}; the first big mistake was move ${Math.ceil(truth / 2)} (${g.moves[truth - 1]}). Let us look at why it was hard to see.`;
    toast(msg, d === 0 ? '' : 'warn', 6000); go(truth, true); paintMoves();
  };
  $('#pick', root).onclick = () => reveal(ply || 1); $('#nopick', root).onclick = () => reveal(null); $('#showme', root).onclick = () => setBlind(false);
  // facts about the blunder: computed by code (the real build uses Stockfish's line instead of this dummy search)
  const afterFen = (() => { const c = new Chess(fenBeforeBlunder); c.move('Nh4'); return c.fen(); })();
  const reply = principalLine(afterFen, 1, 3);
  const lf = lineFacts(fenBeforeBlunder, 'Nh4', reply);
  const pkg = buildPackage(fenBeforeBlunder, 'Nh4', lf);
  $('#after-t', root).textContent = lf.sentence;
  $('#ai', root).onclick = async () => {
    $('#ai-s', root).textContent = 'Asking Groq…'; const r = await explain(pkg);
    if (r.ok) { $('#ai-t', root).textContent = r.text; $('#ai-s', root).textContent = 'Reworded by Groq; every move, square and number was checked against the facts.'; }
    else { $('#ai-t', root).textContent = lf.sentence + ' Habit: ' + pkg.habit; $('#ai-s', root).textContent = r.reason === 'no-key' ? 'No Groq key set (Settings). Showing the built-in text.' : `Groq unavailable (${r.reason}). Showing the built-in text.`; }
  };
  paintGraph(); go(0, true);
  $('#p-next', root).onclick = () => go(ply + 1); $('#p-prev', root).onclick = () => go(ply - 1, true);
  $('#p-start', root).onclick = () => go(0, true); $('#p-end', root).onclick = () => go(g.moves.length, true);
  $('#jump', root).onclick = () => go(firstMistakePly, true);
  let playing = null;
  $('#p-play', root).onclick = (e) => {
    if (playing) { clearInterval(playing); playing = null; e.target.textContent = '▶ Play'; return; }
    e.target.textContent = '⏸ Pause';
    playing = setInterval(() => { if (ply >= g.moves.length) { clearInterval(playing); playing = null; e.target.textContent = '▶ Play'; } else go(ply + 1); }, 900);
  };
  $('#save-why', root).onclick = () => {
    toast('Saved. Your own words are kept with this position.');
    $('#diag', root).innerHTML = `<h3>Why it probably happened</h3>` + diagnosis.map((d) => `<div class="coach-card ${d.conf === 'High' ? 'warn' : 'info'}"><h4>${d.cause} <span class="chip ${d.conf === 'High' ? 'yellow' : ''}">${d.conf} confidence</span></h4><div class="small">${d.why}</div><div class="small muted" style="margin-top:6px">Is this right? <button class="btn small ghost">Yes</button> <button class="btn small ghost">No, it was…</button></div></div>`).join('')
      + `<div class="coach-card"><h4>🏋 Training from this</h4><div class="small">Added to Blunder Box (returns in 1 day) · focus skill: <b>Hanging pieces</b> · the next session starts with 4 drills like this.</div></div>`;
  };
  return () => clearInterval(playing);
}
