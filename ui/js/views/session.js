import { sessionBlocks, dailyTest, puzzles, teacherNotes } from '../data.js';
import { mountPuzzle } from './_puzzle.js';
import { $, $$, esc, toast, confetti, countUp } from '../ui.js';

export function render(root) {
  let idx = sessionBlocks.findIndex((b) => !b.done);
  if (idx < 0) idx = sessionBlocks.length - 1;
  const results = [];

  const frame = (inner) => {
    root.innerHTML = `
    <div class="page-h"><div><h1>Today's Session</h1><p class="muted">One focus: <b>Hanging pieces</b>. Take your time — accuracy beats speed.</p></div><a class="btn ghost" href="#/home">Save and leave</a></div>
    <div class="grid" style="grid-template-columns:260px 1fr;align-items:start">
      <div class="steps">${sessionBlocks.map((b, i) => `<div class="step ${i < idx ? 'done' : i === idx ? 'cur' : ''}"><span class="ic">${b.icon}</span><div><b>${b.title}</b><div class="small muted">${b.min} min</div></div><span class="tick">${i < idx ? '✓' : ''}</span></div>`).join('')}</div>
      <section class="card" id="stage">${inner}</section></div>`;
  };
  const next = () => { idx++; idx >= sessionBlocks.length ? finish() : show(); };

  const show = () => {
    const b = sessionBlocks[idx];
    if (b.id === 'recall') return recall();
    if (b.id === 'lesson') return lessonBlock();
    if (b.id === 'drills') return drills();
    if (b.id === 'play') return playBlock();
    if (b.id === 'test') return test();
    note();
  };

  const recall = () => {
    const cards = [['What is an undefended piece?', 'A piece that no friendly piece can recapture on.'], ['What do you check before every move?', 'Their last move, then checks, captures, threats.'], ['A fork attacks…?', 'Two or more pieces at once.']];
    let i = 0;
    const paint = () => {
      frame(`<div class="chip">Card ${i + 1} / ${cards.length}</div><h2 style="margin-top:12px">${cards[i][0]}</h2><p class="muted">Answer in your head first.</p><div id="ans"></div><button class="btn primary" id="rev">Show answer</button>`);
      $('#rev', root).onclick = () => { $('#ans', root).innerHTML = `<div class="coach-card"><h4>Answer</h4><div class="small">${cards[i][1]}</div></div><div class="conf" style="margin-top:8px"><button class="btn" data-g>Got it</button><button class="btn" data-g>Almost</button><button class="btn" data-g>Forgot</button></div>`; $('#rev', root).remove(); $$('[data-g]', root).forEach((b) => b.onclick = () => { i++; i < cards.length ? paint() : (sessionBlocks[idx].done = true, next()); }); };
    };
    paint();
  };
  const lessonBlock = () => {
    frame(`<h2>📖 Undefended pieces</h2><p>A piece is <b>undefended</b> when nothing can recapture on its square. Free pieces decide most games below 1000.</p>
      <div class="coach-card info"><h4>The three questions</h4><div class="small">1. What is attacked? 2. What is protected? 3. What can they capture next?</div></div><a class="btn" href="#/learn/l2">Open the full interactive lesson</a>
      <div style="margin-top:12px"><button class="btn primary" id="n">Got it — continue</button></div>`);
    $('#n', root).onclick = () => { sessionBlocks[idx].done = true; next(); };
  };
  const drills = () => {
    let i = 0, ok = 0;
    const paint = () => {
      frame(`<div class="row"><b>Drill ${i + 1} / 3</b><span class="grow"></span><span class="chip green">${ok} clean</span></div><div id="pz"></div><div id="after"></div>`);
      mountPuzzle($('#pz', root), puzzles[i], { threatStep: true, onDone: ({ correct, hints }) => {
        if (correct && !hints) ok++;
        $('#after', root).innerHTML = `<button class="btn primary" id="n" style="margin-top:12px">${i < 2 ? 'Next drill' : 'Finish drills'}</button>`;
        $('#n', root).onclick = () => { i++; i < 3 ? paint() : (sessionBlocks[idx].done = true, next()); };
      } });
    };
    paint();
  };
  const playBlock = () => {
    frame(`<h2>♟️ Play block</h2><p>One slow game against Rook Rita (1000) in Coach mode. The Safety Check is on.</p><div class="coach-card warn"><h4>Today's consequence rule</h4><div class="small">If you blunder a piece, you may take it back — but only after naming the threat.</div></div>
      <a class="btn primary big" href="#/play">Go to the board</a> <button class="btn ghost" id="skip">I played (continue)</button>`);
    $('#skip', root).onclick = () => { sessionBlocks[idx].done = true; next(); };
  };
  const test = () => {
    let q = 0;
    const paint = () => {
      const t = dailyTest[q];
      frame(`<div class="row"><b>Question ${q + 1} / ${dailyTest.length}</b><span class="grow"></span><span class="chip">${q < 2 ? 'old material' : 'trap: no lesson pattern'}</span></div><p>${t.q}</p><div id="pz"></div>
        <div id="conf" class="coach-card info" style="margin-top:12px"><h4>How sure are you?</h4><div class="conf"><button class="btn" data-c="sure">Sure</button><button class="btn" data-c="unsure">Unsure</button><button class="btn" data-c="guess">Guess</button></div></div><div id="after"></div>`);
      let conf = null;
      $$('[data-c]', root).forEach((b) => b.onclick = () => { conf = b.dataset.c; $$('[data-c]', root).forEach((x) => x.classList.toggle('on', x === b)); });
      mountPuzzle($('#pz', root), puzzles.find((p) => p.id === t.puzzle), { onDone: ({ correct, hints }) => {
        results.push({ correct, hints, conf: conf || 'none' });
        $('#after', root).innerHTML = `<div class="coach-card ${correct && conf === 'sure' ? '' : 'warn'}" style="margin-top:12px"><h4>${correct ? (conf === 'sure' ? 'Right and sure — solid' : 'Right, but you said "' + (conf || 'no rating') + '" — unstable') : 'Missed'}</h4><div class="small">${!correct && conf === 'sure' ? 'Sure and wrong is the most useful signal. This one returns tomorrow.' : 'Logged for scheduling.'}</div></div><button class="btn primary" id="n" style="margin-top:8px">${q < dailyTest.length - 1 ? 'Next question' : 'See results'}</button>`;
        $('#n', root).onclick = () => { q++; q < dailyTest.length ? paint() : (sessionBlocks[idx].done = true, next()); };
      } });
    };
    paint();
  };
  const note = () => {
    const right = results.filter((r) => r.correct).length;
    frame(`<h2>💬 Note from Mentor</h2><div class="mentor-bubble"><div class="avatar">♞</div><div class="bubble">${teacherNotes.map((n) => `• ${n}`).join('<br>')}</div></div>
      <p class="small muted">Test: ${right}/${results.length} correct${results.some((r) => r.correct && r.conf !== 'sure') ? ' · some answers were right but unsure' : ''}.</p><button class="btn primary big" id="d">Finish session</button>`);
    $('#d', root).onclick = () => { sessionBlocks[idx].done = true; finish(); };
  };
  const finish = () => {
    confetti(80);
    frame(`<div style="text-align:center;padding:30px 0"><div style="font-size:64px">🔥</div><h1>Session complete</h1><p class="muted">Streak: 5 days. Rest day: Sunday.</p><a class="btn primary big" href="#/home">Back home</a></div>`);
  };
  show();
}
