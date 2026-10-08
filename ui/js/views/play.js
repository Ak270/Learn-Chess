import { Chess } from '../../vendor/chess.js';
import { Board } from '../board.js';
import { LEVELS, pickMove, hangingAfter, VAL, material } from '../bot.js';
import { $, $$, esc, toast, modal, sound, settings, confetti, piecesUnicode } from '../ui.js';

const TCS = [['15+10', 900, 10], ['10+0', 600, 0], ['30+0', 1800, 0], ['Untimed', 0, 0]];

export function render(root) {
  const cfg = { level: 4, tc: 0, mode: settings.get('mode'), color: 'w' };
  const lobby = () => {
    root.innerHTML = `
    <div class="page-h"><div><h1>Play</h1><p class="muted">Slow games teach more. Coach mode adds the Safety Check; Normal mode stays silent and just records.</p></div></div>
    <div class="grid" style="max-width:980px">
      <section><h3>1 · Choose your sparring partner</h3><div class="bot-grid stagger">${LEVELS.map((l) => `
        <button class="bot ${l.id === cfg.level ? 'sel' : ''}" data-lv="${l.id}"><div class="avatar">${['♟', '♞', '♝', '♜', '♛'][l.id - 1]}</div><b>${l.name}</b> <span class="chip">${l.elo}</span><div class="small muted" style="margin-top:6px">${l.blurb}</div></button>`).join('')}</div></section>
      <div class="grid g3">
        <section class="card"><h3>2 · Time</h3><div class="seg" id="tcs">${TCS.map((t, i) => `<button class="${i === cfg.tc ? 'on' : ''}" data-tc="${i}">${t[0]}</button>`).join('')}</div><p class="small muted" style="margin-top:8px">Training default is 15+10 or slower.</p></section>
        <section class="card"><h3>3 · Mode</h3><div class="seg" id="modes"><button class="${cfg.mode === 'coach' ? 'on' : ''}" data-m="coach">🎓 Coach</button><button class="${cfg.mode === 'normal' ? 'on' : ''}" data-m="normal">♟ Normal</button></div>
          <p class="small muted" style="margin-top:8px" id="mode-d"></p></section>
        <section class="card"><h3>4 · Colour</h3><div class="seg" id="cols"><button class="on" data-c="w">⬜ White</button><button data-c="b">⬛ Black</button><button data-c="r">🎲 Random</button></div></section>
      </div>
      <div><button class="btn primary big" id="start">Start game</button></div>
    </div>`;
    const modeText = () => { $('#mode-d', root).textContent = cfg.mode === 'coach' ? 'Safety Check before each move, a rushed-move nudge, take-back offers and hints.' : 'No interruptions. Evidence is saved for your review.'; };
    modeText();
    $$('[data-lv]', root).forEach((b) => b.onclick = () => { cfg.level = +b.dataset.lv; $$('[data-lv]', root).forEach((x) => x.classList.toggle('sel', x === b)); });
    const seg = (sel, attr, fn) => $$(sel + ' button', root).forEach((b) => b.onclick = () => { $$(sel + ' button', root).forEach((x) => x.classList.toggle('on', x === b)); fn(b.dataset[attr]); });
    seg('#tcs', 'tc', (v) => { cfg.tc = +v; }); seg('#modes', 'm', (v) => { cfg.mode = v; settings.set('mode', v); modeText(); }); seg('#cols', 'c', (v) => { cfg.color = v; });
    $('#start', root).onclick = () => game();
  };

  let timer = null;
  const game = () => {
    const level = LEVELS[cfg.level - 1];
    const me = cfg.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : cfg.color;
    const tc = TCS[cfg.tc];
    const chess = new Chess();
    const clocks = { w: tc[1], b: tc[1] };
    const log = []; // verbose moves
    let view = null; // ply index being viewed (null = live)
    let over = false, thinking = false, blunders = 0, hints = 0, checks = 0;
    const takeback = { used: 0 };

    root.innerHTML = `
    <div class="game">
      <div class="game-main">
        <div class="playerbar" id="top"></div>
        <div class="board-wrap"><div class="eval-bar" id="evb" hidden></div><div id="bd"></div></div>
        <div class="playerbar" id="bot"></div>
      </div>
      <aside class="side">
        <div class="tabs" style="padding:6px 8px 0;margin:0"><button class="tab active" data-t="moves">Moves</button><button class="tab" data-t="coach">${cfg.mode === 'coach' ? '🎓 Coach' : 'Notes'}</button><button class="tab" data-t="info">Game</button></div>
        <div class="body" id="pane"></div>
        <div class="ctrls">
          <button class="btn" id="b-hint" title="Hint ladder">💡 Hint</button><button class="btn" id="b-back" title="Take back">↩ Takeback</button>
          <button class="btn" id="b-flip" title="Flip board (F)">⇅ Flip</button><button class="btn" id="b-draw">½ Draw</button><button class="btn danger" id="b-res">🏳 Resign</button>
        </div>
      </aside>
    </div>`;
    const board = new Board($('#bd', root), {
      chess, orientation: me, coords: settings.get('coords'),
      interactive: (c) => !over && !thinking && view === null && c === me,
      onUserMove: (mv) => userMove(mv),
    });
    const bdEl = $('#bd', root);

    const names = { me: 'You (612)', bot: `${level.name} (${level.elo})` };
    const bar = (side, who, icon) => `<div class="avatar">${icon}</div><div><span class="nm">${who}</span><div class="row" style="gap:4px"><span class="caps" id="caps-${side}"></span><span class="adv" id="adv-${side}"></span></div></div><div class="clock" id="clk-${side}">--:--</div>`;
    $('#top', root).innerHTML = bar(me === 'w' ? 'b' : 'w', names.bot, ['♟', '♞', '♝', '♜', '♛'][level.id - 1]);
    $('#bot', root).innerHTML = bar(me, names.me, '🧑');

    const fmt = (s) => (tc[1] ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '∞');
    const paintClocks = () => ['w', 'b'].forEach((c) => {
      const e = $('#clk-' + c, root); if (!e) return; e.textContent = fmt(clocks[c]);
      e.classList.toggle('on', !over && chess.turn() === c && log.length > 0); e.classList.toggle('low', tc[1] > 0 && clocks[c] < 30);
    });
    const captured = () => {
      const got = { w: [], b: [] }; // pieces captured BY colour
      for (const m of log) if (m.captured) got[m.color].push(m.captured);
      ['w', 'b'].forEach((c) => {
        const e = $('#caps-' + c, root); if (e) e.textContent = got[c].sort((a, b) => VAL[b] - VAL[a]).map((t) => piecesUnicode[t]).join('');
        const diff = got[c].reduce((a, t) => a + VAL[t], 0) - got[c === 'w' ? 'b' : 'w'].reduce((a, t) => a + VAL[t], 0);
        const a = $('#adv-' + c, root); if (a) a.textContent = diff > 0 ? '+' + diff : '';
      });
    };

    let tab = 'moves';
    const coachMsgs = [{ k: 'info', h: 'Welcome', t: cfg.mode === 'coach' ? 'Before each move: what did their last move do? Then checks, captures, threats — theirs first, then yours.' : 'Normal mode. No interruptions. I will show you a review afterwards.' }];
    const checklist = { a: false, b: false, c: false };
    const paintPane = () => {
      const pane = $('#pane', root);
      if (tab === 'moves') {
        let h = '<div class="moves">';
        for (let i = 0; i < log.length; i += 2) {
          h += `<div class="n">${i / 2 + 1}</div>` + [i, i + 1].map((j) => (log[j] ? `<div class="m ${(view ?? log.length - 1) === j ? 'cur' : ''}" data-ply="${j}">${log[j].san}</div>` : '<div></div>')).join('');
        }
        pane.innerHTML = (log.length ? h + '</div>' : '<p class="muted">The game has not started. Make your first move.</p>');
        const cur = $('.cur', pane); cur && cur.scrollIntoView({ block: 'nearest' });
        $$('.m', pane).forEach((e) => e.onclick = () => goto(+e.dataset.ply));
      } else if (tab === 'coach') {
        pane.innerHTML = (cfg.mode === 'coach' ? `<div class="coach-card"><h4>🛡 Safety Check</h4><div class="check-list">
            <label><input type="checkbox" data-k="a" ${checklist.a ? 'checked' : ''}> What did their last move do?</label>
            <label><input type="checkbox" data-k="b" ${checklist.b ? 'checked' : ''}> Checks, captures, threats — theirs, then mine</label>
            <label><input type="checkbox" data-k="c" ${checklist.c ? 'checked' : ''}> Where can their best reply land? Is anything hanging?</label></div>
            <p class="small muted" style="margin:6px 0 0">Tick as you think. The checklist is a habit, not a gate (until a blunder triggers the slow-down lock).</p></div>` : '') +
          coachMsgs.slice().reverse().map((m) => `<div class="coach-card ${m.k}"><h4>${m.h}</h4><div class="small">${m.t}</div>${m.act || ''}</div>`).join('');
        $$('input[data-k]', pane).forEach((i) => i.onchange = () => { checklist[i.dataset.k] = i.checked; });
        const tb = $('#take-yes', pane); tb && (tb.onclick = doTakeback);
      } else {
        pane.innerHTML = `<p><b>${names.bot}</b> vs <b>${names.me}</b></p><p class="muted small">Mode: ${cfg.mode} · Time: ${tc[0]}</p>
          <p class="small">Blunders flagged: <b>${blunders}</b> · Hints used: <b>${hints}</b> · Safety checks ticked: <b>${checks}</b></p>
          <p class="proto">Prototype bot: 1–3 ply material search with noise. The real build uses Stockfish/Maia in a Web Worker.</p>`;
      }
    };
    const say = (k, h, t, act = '') => { coachMsgs.push({ k, h, t, act }); if (tab !== 'coach') { const t0 = $$('.tab', root)[1]; t0.textContent = (cfg.mode === 'coach' ? '🎓 Coach' : 'Notes') + ' •'; } paintPane(); };

    $$('.tab', root).forEach((b) => b.onclick = () => { $$('.tab', root).forEach((x) => x.classList.toggle('active', x === b)); tab = b.dataset.t; b.textContent = b.textContent.replace(' •', ''); paintPane(); });

    const goto = (ply) => { // view history
      const c = new Chess(); log.slice(0, ply + 1).forEach((m) => c.move(m.san));
      view = ply === log.length - 1 ? null : ply;
      board.chess = view === null ? chess : c; board.render(); board.setLastMove(log[ply]);
      board.chess = view === null ? chess : c; paintPane();
    };

    const sync = () => { captured(); paintClocks(); paintPane(); if (!$('#evb', root).hidden) paintEval(); };
    const paintEval = () => { const e = material(chess); const pct = 50 + Math.max(-45, Math.min(45, e * 6)); $('#evb', root).innerHTML = `<div class="w" style="height:${pct}%"></div><span class="top">${e < 0 ? Math.abs(e) : ''}</span><span class="bot">${e > 0 ? e : ''}</span>`; };

    const endGame = (title, text, win) => {
      over = true; clearInterval(timer); sync();
      win && confetti();
      modal(`<h2>${title}</h2><p class="muted">${text}</p>
        <div class="coach-card"><h4>First meaningful mistake</h4><div class="small">${blunders ? `${blunders} blunder(s) flagged in this game. The review will find the earliest one and ask what you were aiming for.` : 'No hanging pieces flagged. Nice discipline.'}</div></div>
        <div class="row" style="margin-top:16px"><a class="btn primary" href="#/review" data-x>Review the game</a><button class="btn" id="again">New game</button></div>`,
        { onMount: (bg, close) => { $('#again', bg).onclick = () => { close(); lobby(); }; $('[data-x]', bg).onclick = close; } });
    };

    const afterMove = (m, byMe) => {
      log.push(m); board.applyMove(m); view = null;
      sound(chess.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
      if (tc[1]) clocks[m.color] += tc[2];
      sync();
      if (chess.isCheckmate()) return endGame(byMe ? 'You won by checkmate!' : 'Checkmate', byMe ? 'Well played.' : `${level.name} got you. Every loss shows what to train next.`, byMe);
      if (chess.isDraw()) return endGame('Draw', chess.isStalemate() ? 'Stalemate.' : 'Drawn position.', false);
    };

    const userMove = (mv) => {
      if (over || thinking) return false;
      let m;
      try { m = chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion || 'q' }); } catch { return false; }
      if (!m) return false;
      const ticked = Object.values(checklist).filter(Boolean).length; checks += ticked;
      const startedAt = lastTurnAt; const spent = (Date.now() - startedAt) / 1000;
      afterMove(m, true);
      if (over) return true;
      if (cfg.mode === 'coach') {
        const hang = hangingAfter(chess, me);
        if (hang.length && hang[0].gain >= 2) {
          blunders++;
          const h = hang[0];
          board.setArrows([[h.from, h.to, 'red']]); sound('bad');
          const name = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
          say('bad', 'Wait — look at that move', `Your ${name[h.piece]} on <b>${h.to}</b> can now be taken by a ${name[h.by]}. Want to take it back? Tell me first: <b>what does the opponent threaten?</b>`,
            `<div class="row" style="margin-top:8px"><button class="btn small primary" id="take-yes">↩ Take it back</button><button class="btn small ghost" id="take-no">Keep it</button></div>`);
          tab = 'coach'; $$('.tab', root).forEach((x) => x.classList.toggle('active', x.dataset.t === 'coach')); paintPane();
          $('#take-no', root).onclick = () => { board.setArrows([]); thinking = false; botTurn(); };
          thinking = true; // paused until the player chooses
          return true;
        }
        if (spent < 2 && log.length > 8 && !ticked) toast('Rushed? Try the Safety Check — it takes five seconds.', 'warn');
        else if (ticked === 3) toast('Safety Check complete. 👏', '');
        Object.keys(checklist).forEach((k) => (checklist[k] = false));
      }
      botTurn(); return true;
    };

    const doTakeback = () => {
      board.setArrows([]);
      chess.undo(); log.pop(); takeback.used++;
      board.chess = chess; board.render(); board.setLastMove(log[log.length - 1] || null);
      thinking = false; coachMsgs.push({ k: 'info', h: 'Take-back granted', t: 'Good. Find a move that keeps everything protected. What changed after their last move?' }); sync();
    };

    let lastTurnAt = Date.now();
    const botTurn = () => {
      if (over) return;
      thinking = true; lastTurnAt = Date.now();
      const delay = 450 + Math.random() * 700;
      setTimeout(() => {
        if (over) return;
        const bm = pickMove(chess, level);
        if (!bm) return;
        const m = chess.move(bm);
        afterMove(m, false); thinking = false; lastTurnAt = Date.now();
      }, delay);
    };

    // clocks
    clearInterval(timer);
    if (tc[1]) timer = setInterval(() => {
      if (over || !log.length) return;
      clocks[chess.turn()] = Math.max(0, clocks[chess.turn()] - 1); paintClocks();
      if (clocks[chess.turn()] === 0) endGame(chess.turn() === me ? 'Out of time' : 'You won on time', 'The clock ran out.', chess.turn() !== me);
    }, 1000);

    $('#b-flip', root).onclick = () => board.flip();
    $('#b-res', root).onclick = () => modal(`<h2>Resign this game?</h2><p class="muted">Resigning is fine. You will still get a review.</p><div class="row"><button class="btn danger" id="y">Resign</button><button class="btn" id="n">Keep playing</button></div>`, { onMount: (bg, close) => { $('#n', bg).onclick = close; $('#y', bg).onclick = () => { close(); endGame('You resigned', 'Let us find what went wrong.', false); }; } });
    $('#b-draw', root).onclick = () => { toast(`${level.name} declines the draw.`); };
    $('#b-back', root).onclick = () => { if (cfg.mode !== 'coach') return toast('Take-backs are a Coach-mode feature.'); if (thinking && !over) return toast('Wait for the move to finish.'); if (log.length < 2) return; chess.undo(); log.pop(); chess.undo(); log.pop(); board.render(); board.setLastMove(log[log.length - 1] || null); sync(); toast('Took back your last move.'); };
    $('#b-hint', root).onclick = () => {
      if (over || thinking) return;
      hints++;
      const steps = ['Look at the opponent\'s last move. What did it attack or open up?', null, null];
      const last = log[log.length - 1];
      if (hints % 3 === 1) say('info', 'Hint 1 of 3', steps[0]);
      else if (hints % 3 === 2) { if (last) board.setArrows([[last.from, last.to, 'blue']]); say('info', 'Hint 2 of 3', 'Their last move is highlighted. What can that piece capture or check next?'); }
      else { const bm = pickMove(chess, LEVELS[4]); board.setArrows([[bm.from, bm.to, 'green']]); say('info', 'Hint 3 of 3', `A solid candidate is <b>${bm.san}</b>. Still check what it leaves unprotected.`); }
      tab = 'coach'; $$('.tab', root).forEach((x) => x.classList.toggle('active', x.dataset.t === 'coach')); paintPane();
    };
    document.onkeydown = (e) => { if (e.target.matches('input,textarea')) return; if (e.key === 'f') board.flip(); if (e.key === 'ArrowLeft' && log.length) goto(Math.max(0, (view ?? log.length - 1) - 1)); if (e.key === 'ArrowRight' && view !== null) goto(Math.min(log.length - 1, view + 1)); };

    if (cfg.mode !== 'coach') $('#b-hint', root).disabled = true;
    paintPane(); sync();
    if (me === 'b') botTurn();
    window.__game = { chess, board }; // debug handle for the prototype
  };

  lobby();
  return () => { clearInterval(timer); document.onkeydown = null; };
}
