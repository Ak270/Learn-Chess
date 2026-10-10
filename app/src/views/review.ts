// Game Review (docs/backend/04 §6, docs/backend/10 §2). Ported from ui/js/views/review.js, wired to real data.
import { Chess, type Move } from 'chess.js';
import { Board } from '../components/BoardApi';
import { db, metrics, reviews, store } from '../app';
import { mistakeFacts, moveLabel } from '../core/chess/facts';
import { $, $$, esc, toast } from '../shell/dom';
import { classMeta, lineChart, sound } from '../shell/ui';
import { settings } from '../shell/settings';
import { startJob } from '../services/JobService';
import type { Game, GameReview, Mistake, MoveClass, PlyRecord } from '../types/model';
import { cfg } from '../config';

const CAUSE_TITLE: Record<string, string> = {
  perception: "Didn't see the threat",
  calculation: 'Saw it, but misjudged',
  over_focus_own_plan: 'Over-focused on your own plan',
  rushed: 'Moved too fast',
  knowledge_gap: 'An idea you are still learning',
  transfer_failure: 'Knew it in drills, missed it in the game',
  tilt: 'Possible tilt',
  unknown: 'No clear pattern yet',
};
const CONF_CHIP: Record<string, string> = { high: 'yellow', medium: '', low: '' };
const GOOD: MoveClass[] = ['book', 'good', 'best', 'excellent', 'great', 'brilliant'];

const badge = (c?: MoveClass) =>
  c
    ? `<span class="cl" style="background:${classMeta[c].color};${['good', 'best', 'excellent'].includes(c) ? 'color:#10200a' : ''}" title="${classMeta[c].label}">${classMeta[c].sym}</span>`
    : '';

export async function render(root: HTMLElement, ctx: { args: string[] }) {
  const gameId = ctx.args[0];
  if (!gameId) return renderList(root);
  const game = await db.games.get(gameId);
  if (!game) {
    root.innerHTML = `<div class="page-h"><div><h1>Game not found</h1><p class="muted">It may have been deleted. <a href="#/review">Back to your games</a></p></div></div>`;
    return;
  }
  const review = await reviews.getReview(gameId);
  if (!review) return renderProgress(root, game);
  return renderGame(
    root,
    game,
    review,
    Number(new URLSearchParams(location.hash.split('?')[1] ?? '').get('ply')) || undefined,
  );
}

// ---------- list of games ----------
async function renderList(root: HTMLElement) {
  const games = await store.gamesNewestFirst(60);
  const rows = await Promise.all(
    games.map(async (g) => {
      const r = await reviews.getReview(g.id);
      const m = r?.firstMeaningfulPly
        ? (await store.mistakesForGame(g.id)).find((x) => x.isFirstMeaningful)
        : undefined;
      return { g, r, m };
    }),
  );
  root.innerHTML = `
  <div class="page-h"><div><h1>Game Review</h1><p class="muted">Pick a game. Mentor finds the first mistake that really mattered.</p></div>
    <div class="row"><a class="btn" href="#/onboarding/import">Import games</a>${rows.some((x) => !x.r) ? '<button class="btn primary" id="rev-all">Review all new games</button>' : ''}</div></div>
  ${
    rows.length
      ? `<section class="card"><div class="glist">${rows
          .map(({ g, r, m }) => {
            const win = (g.result === '1-0') === (g.playerColor === 'w') && g.result !== '1/2-1/2';
            const res = g.result === '1/2-1/2' ? 'D' : win ? 'W' : 'L';
            const opp = g.playerColor === 'w' ? g.black : g.white;
            return `<a class="it" href="#/review/${g.id}" style="text-decoration:none;color:inherit"><span class="res ${res === 'W' ? 'win' : res === 'L' ? 'loss' : ''}">${res}</span>
              <div class="grow"><b>vs ${esc(opp)}</b> <span class="muted small">· ${g.startedAt ? new Date(g.startedAt).toLocaleDateString() : 'unknown date'}${r ? ` · accuracy ${Math.round(r.accuracy)}%` : ''}</span>
              <div class="small muted">${m ? esc(m.motifs[0]?.evidence ?? 'First meaningful mistake found') : r ? 'No single big mistake stood out.' : 'Not reviewed yet'}</div></div>
              <span class="chip ${r ? 'green' : 'yellow'}">${r ? 'Reviewed' : 'Review'}</span></a>`;
          })
          .join('')}</div></section>`
      : `<section class="card"><h2>No games yet</h2><p class="muted">Import your games to meet your first mistake.</p><a class="btn primary" href="#/onboarding/import">Import games</a></section>`
  }`;
  const all = $('#rev-all', root);
  if (all)
    all.onclick = () => {
      const todo = rows.filter((x) => !x.r).map((x) => x.g.id);
      startJob('Reviewing games', '#/review', async ({ signal, update }) => {
        for (let i = 0; i < todo.length && !signal.cancelled; i++) {
          update({ stage: `Reviewing game ${i + 1} of ${todo.length}`, done: i, total: todo.length });
          for await (const _p of reviews.reviewGame(todo[i], { signal })) void _p;
        }
        update({ stage: 'Done', done: todo.length, total: todo.length });
      });
      toast('Reviewing in the background. You can keep using the app.');
    };
}

// ---------- review progress (stages) ----------
async function renderProgress(root: HTMLElement, game: Game) {
  root.innerHTML = `<div class="page-h"><div><h1>Reviewing your game…</h1><p class="muted" id="stage">Starting</p></div></div>
    <section class="card"><div class="bar"><i id="pbar" style="width:3%"></i></div><p class="small muted" style="margin-top:8px">Analysis runs in the background; you can leave and come back.</p>
    <button class="btn ghost small" id="cancel">Cancel</button></section>`;
  const signal = { cancelled: false };
  $('#cancel', root).onclick = () => {
    signal.cancelled = true;
    location.hash = '#/review';
  };
  const labels: Record<string, string> = {
    queued: 'Getting ready',
    engine: 'Checking each move with the engine',
    select: 'Choosing what to learn',
    save: 'Saving',
    done: 'Done',
  };
  try {
    for await (const p of reviews.reviewGame(game.id, { signal })) {
      if (!root.isConnected) return;
      $('#stage', root).textContent = `${labels[p.stage]}${p.total ? ` (${p.ply} of ${p.total})` : ''}`;
      $('#pbar', root).style.width = `${Math.max(3, p.total ? (p.ply / p.total) * 100 : 3)}%`;
    }
  } catch {
    toast('The engine could not finish this review. Try again.', 'warn', 5000);
    return;
  }
  if (!signal.cancelled && root.isConnected) location.hash = `#/review/${game.id}`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// ---------- the review itself ----------
async function renderGame(root: HTMLElement, game: Game, review: GameReview, startPly?: number) {
  const plies: PlyRecord[] = await store.pliesForGame(game.id);
  const mistakes: Mistake[] = await store.mistakesForGame(game.id);
  const first = mistakes.find((m) => m.isFirstMeaningful) ?? null;
  const firstPly = first?.ply ?? review.firstMeaningfulPly;
  const truthPly = first ? first.ply : null;
  const learner = game.playerColor;
  const opp = learner === 'w' ? game.black : game.white;
  const me = learner === 'w' ? game.white : game.black;

  const chess = new Chess();
  const verbose: Move[] = [];
  for (const p of plies)
    verbose.push(chess.move({ from: p.uci.slice(0, 2), to: p.uci.slice(2, 4), promotion: p.uci[4] }));
  chess.reset();
  let ply = 0;

  const lost = (game.result === '1-0' && learner === 'b') || (game.result === '0-1' && learner === 'w');
  const doneToday = await reviews.findFirstToday();
  const quotaOk = doneToday < cfg.get<number>('review.findFirst.dailyQuota');
  const useBlind = lost && quotaOk && !!truthPly;
  let blindDone = !useBlind;

  const counts = review.counts;
  const cardOn = first?.cardId ? ((await db.cards.get(first.cardId))?.state ?? 'new') !== 'suspended' : false;

  root.innerHTML = `
  <div class="page-h"><div><h1>Game Review</h1><p class="muted">${esc(me)} vs ${esc(opp)} · ${esc(game.result)}${game.timeControl && /^\d/.test(game.timeControl) ? ` · ${esc(game.timeControl)}` : ''}${review.evidenceEligible ? '' : ' · quick game (not used for training decisions)'}</p></div>
    <div class="row"><button class="btn small ghost" id="rerev">Re-review at higher depth</button></div></div>
  <div class="game">
    <div class="game-main">
      <div class="playerbar"><div class="avatar">♜</div><span class="nm">${esc(opp)}</span></div>
      <div class="board-wrap"><div class="eval-bar spoil" id="evb" role="img" aria-label="Evaluation"></div><div id="bd" role="application" aria-label="Chess board"></div></div>
      <div class="playerbar"><div class="avatar">🧑</div><span class="nm">${esc(me)}</span>
        <span class="grow"></span><button class="btn small" id="p-start" aria-label="First move">⏮</button><button class="btn small" id="p-prev" aria-label="Previous move">◀</button><button class="btn small" id="p-play">▶ Play</button><button class="btn small" id="p-next" aria-label="Next move">▶</button><button class="btn small" id="p-end" aria-label="Last move">⏭</button><button class="btn small" id="p-flip" aria-label="Flip board">⇅</button></div>
      <div class="sr-only" aria-live="polite" id="live" style="position:absolute;left:-9999px"></div>
    </div>
    <aside class="side" style="max-height:none">
      <div class="body">
        ${
          useBlind
            ? `<div class="coach-card info blindcard" id="blindcard"><h4>🔎 Find it yourself first</h4>
          <div class="small">Eval, badges and best moves are hidden. Step through the game (◀ ▶ or click a move) and stop at the move you think was <b>your first big mistake</b>.</div>
          <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn small primary" id="pick">That was it — this move</button><button class="btn small ghost" id="nopick">I don't see one</button><button class="btn small ghost" id="showme">Skip: show me</button></div></div>`
            : lost && !quotaOk
              ? `<p class="small muted">You already did ${doneToday} find-it-first reviews today; this one is show-me to keep it light.</p>`
              : ''
        }
        <div id="mistbox"></div>
        <div class="spoil"><h3 style="margin-top:14px">Accuracy</h3>
        <div class="grid g3" style="gap:8px"><div class="card flat"><div class="small muted">You</div><div style="font-size:26px;font-weight:800">${Math.round(review.accuracy)}%</div></div>
          ${(['opening', 'middlegame', 'endgame'] as const).map((ph) => `<div class="card flat"><div class="small muted">${ph[0].toUpperCase() + ph.slice(1)}</div>${review.phaseGrades[ph] ? `<b class="chip ${review.phaseGrades[ph] === 'Solid' ? 'green' : review.phaseGrades[ph] === 'Costly' ? 'red' : 'yellow'}">${review.phaseGrades[ph]}</b>` : '<span class="muted small">—</span>'}</div>`).join('')}</div>
        <h3 style="margin-top:14px">Move quality</h3>
        <div class="row" style="flex-wrap:wrap;gap:6px">${(Object.entries(counts) as [MoveClass, number][]).map(([c, n]) => `<span class="chip" style="background:${classMeta[c].color}33">${classMeta[c].sym} ${classMeta[c].label} ${n}</span>`).join('')}</div>
        <h3 style="margin-top:14px">Chance to win</h3><div id="graph"></div></div>
        <h3 style="margin-top:14px">Moves</h3><div class="moves" id="mv" role="list"></div>
      </div>
      <div class="ctrls">${first?.cardId ? `<button class="btn ${cardOn ? 'primary' : ''}" id="boxbtn">${cardOn ? '📦 In your Blunder Box' : '📦 Add to Blunder Box'}</button>` : ''}${first ? `<a class="btn" href="#/play?fen=${encodeURIComponent(first.fen)}&mode=critical">Play this position</a>` : ''}</div>
    </aside>
  </div>`;

  const board = new Board($('#bd', root), {
    chess,
    orientation: learner,
    interactive: () => false,
    coords: settings.get('coords'),
  });
  const evb = $('#evb', root);
  const paintEval = () => {
    const w = review.whiteWinPct[ply] ?? 50;
    const pct = Math.max(2, Math.min(98, w));
    const txt = Math.abs(w - 50) >= 5 ? `${Math.round(w >= 50 ? w : 100 - w)}%` : '';
    evb.innerHTML = `<div class="w" style="height:${pct}%"></div><span class="top">${w < 50 ? txt : ''}</span><span class="bot">${w >= 50 ? txt : ''}</span>`;
    evb.setAttribute('aria-label', `White has about ${Math.round(w)} percent chance to win`);
  };
  const paintMoves = () => {
    let h = '';
    for (let i = 0; i < plies.length; i += 2) {
      h +=
        `<div class="n">${i / 2 + 1}</div>` +
        [i, i + 1]
          .map((j) =>
            plies[j]
              ? `<div class="m ${ply - 1 === j ? 'cur' : ''}" data-i="${j}" role="listitem" tabindex="0">${esc(plies[j].san)}${plies[j].color === learner && !plies[j].isBook ? badge(plies[j].cls) : ''}</div>`
              : '<div></div>',
          )
          .join('');
    }
    $('#mv', root).innerHTML = h;
    $$('#mv .m', root).forEach((e) => {
      e.onclick = () => go(+e.dataset.i! + 1, true);
      e.onkeydown = (ev) => ev.key === 'Enter' && go(+e.dataset.i! + 1, true);
    });
    $('#mv .cur', root)?.scrollIntoView({ block: 'nearest' });
  };
  const paintGraph = () => {
    const el = $('#graph', root);
    el.innerHTML =
      lineChart(review.whiteWinPct, {
        h: 140,
        min: 0,
        max: 100,
        color: '#749bbf',
        labels: review.whiteWinPct.map((_, i) => (i ? Math.ceil(i / 2) : '')),
        clickable: true,
        markIndex: firstPly ?? undefined,
        ariaLabel: "White's chance to win after each move",
      }) +
      `<div class="small muted">Click a point to jump to that move.${firstPly ? ' The red dot marks the first meaningful mistake.' : ''}</div>`;
    $$('circle[data-i]', el).forEach((c) => (c.onclick = () => go(+c.dataset.i!, true)));
  };
  const go = (n: number, quiet = false) => {
    n = Math.max(0, Math.min(plies.length, n));
    const prev = ply;
    if (n === prev + 1 && !quiet) {
      board.chess = chess;
      chess.move(plies[prev].san);
      board.applyMove(verbose[prev]);
    } else {
      chess.reset();
      for (let i = 0; i < n; i++) chess.move(plies[i].san);
      board.render();
      board.setLastMove(n ? verbose[n - 1] : null);
    }
    ply = n;
    const p = n ? plies[n - 1] : null;
    board.setMarks(
      p && p.color === learner && p.cls && !p.isBook
        ? { [verbose[n - 1].to]: { text: classMeta[p.cls].sym, badgeColor: classMeta[p.cls].color } }
        : {},
    );
    const mAt = p && mistakes.find((m) => m.ply === n);
    board.setArrows(
      blindDone && mAt?.refutationUci ? [[mAt.refutationUci.slice(0, 2), mAt.refutationUci.slice(2, 4), 'red']] : [],
    );
    if (blindDone && p?.cls === 'blunder') sound('bad');
    paintEval();
    paintMoves();
    $('#live', root).textContent = p ? `${moveLabel(n, p.san)}` : 'Start position';
  };

  // ----- mistakes panel -----
  const renderMistakes = () => {
    const box = $('#mistbox', root);
    if (!mistakes.length) {
      box.innerHTML = `<div class="coach-card good spoil"><h4>✅ No big mistake stood out</h4><div class="small">Nothing in this game crossed the "meaningful mistake" line. Look through the moves for small inaccuracies if you like.</div></div>`;
      return;
    }
    box.innerHTML = mistakes
      .map((m) => {
        const p = plies.find((q) => q.ply === m.ply)!;
        const f = mistakeFacts(m, p);
        const isFirst = m.isFirstMeaningful;
        return `<div class="coach-card ${isFirst ? 'bad' : 'warn'} spoil" data-m="${m.id}">
          <h4>${isFirst ? '🎯 First meaningful mistake' : '⚠️ Also worth learning from'} · move ${Math.ceil(m.ply / 2)}</h4>
          <div class="small">${esc(f.summary)} ${esc(f.reply?.sentence ?? '')} <span class="muted">${esc(f.turn)}</span></div>
          <div class="row" style="margin-top:8px"><button class="btn small primary" data-jump="${m.ply}">Show me the position</button></div>
          ${
            isFirst
              ? `<div class="coach-card info" style="margin-top:10px"><h4>❓ Your turn, before I explain</h4><div class="small" style="margin-bottom:8px">What were you aiming for with ${esc(p.san)}?</div>
              <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:6px" role="group" aria-label="Quick answer">${['attack|Attack something', 'defend|Defend something', 'develop|Develop', 'unsure|Not sure'].map((c) => `<button class="btn small ghost chipbtn" data-chip="${c.split('|')[0]}" aria-pressed="false">${c.split('|')[1]}</button>`).join('')}</div>
              <textarea rows="2" id="why-${m.id}" aria-label="What were you aiming for?" placeholder="e.g. I wanted to attack the bishop on g6">${esc(m.selfExplanation?.text?.replace(/^[a-z]+: ?/, '') ?? '')}</textarea>
              <button class="btn small" data-save="${m.id}" style="margin-top:8px">Save and reveal diagnosis</button></div>`
              : ''
          }
          <div data-diag="${m.id}">${m.selfExplanation || !isFirst ? diagHtml(m) : ''}</div></div>`;
      })
      .join('');
    $$('[data-jump]', box).forEach((b) => (b.onclick = () => go(+b.dataset.jump!, true)));
    let chip: 'attack' | 'defend' | 'develop' | 'unsure' | undefined;
    $$('.chipbtn', box).forEach(
      (b) =>
        (b.onclick = () => {
          chip = b.dataset.chip as typeof chip;
          $$('.chipbtn', box).forEach((x) => {
            x.classList.toggle('primary', x === b);
            x.setAttribute('aria-pressed', String(x === b));
          });
        }),
    );
    $$('[data-save]', box).forEach(
      (b) =>
        (b.onclick = async () => {
          const id = b.dataset.save!;
          const text = ($(`#why-${id}`, box) as HTMLTextAreaElement).value;
          const diag = await reviews.rediagnose(id, { chip, text });
          const m = mistakes.find((x) => x.id === id)!;
          if (diag) m.diagnosis = diag;
          m.selfExplanation = { text: [chip, text].filter(Boolean).join(': '), at: Date.now() };
          toast('Saved. Your own words are kept with this position.');
          $(`[data-diag="${id}"]`, box).innerHTML = diagHtml(m);
          wireDiag(box);
        }),
    );
    wireDiag(box);
  };
  const diagHtml = (m: Mistake) =>
    `<h3 style="margin-top:12px">Why it probably happened</h3>` +
    m.diagnosis
      .map(
        (
          h,
        ) => `<div class="coach-card ${h.confidence === 'high' ? 'warn' : 'info'}"><h4>${CAUSE_TITLE[h.cause]} <span class="chip ${CONF_CHIP[h.confidence]}">${h.confidence} confidence</span></h4>
        <ul class="small" style="margin:4px 0 0 18px">${h.signals.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="small muted" style="margin-top:6px">${h.confirmedByUser === undefined ? `Is this right? <button class="btn small ghost" data-yes="${m.id}|${h.cause}">Yes</button> <button class="btn small ghost" data-no="${m.id}|${h.cause}">No, it was…</button>` : h.confirmedByUser === true ? 'Thanks, you confirmed this.' : `Thanks. You said it was: ${esc(CAUSE_TITLE[h.correctedTo ?? 'unknown'])}.`}</div></div>`,
      )
      .join('') +
    `<div class="coach-card"><h4>🏋 Training from this</h4><div class="small">${m.cardId ? 'A Blunder Box card was made from this position. It comes back tomorrow.' : 'No card was made for this one.'} Focus skill: <b>${esc(m.skillTags[0].replace(/_/g, ' '))}</b>.</div></div>`;
  const wireDiag = (box: HTMLElement) => {
    $$('[data-yes]', box).forEach(
      (b) =>
        (b.onclick = async () => {
          const [id, cause] = b.dataset.yes!.split('|');
          await reviews.confirmDiagnosis(id, cause, true);
          const m = mistakes.find((x) => x.id === id)!;
          m.diagnosis = (await db.mistakes.get(id))!.diagnosis;
          $(`[data-diag="${id}"]`, box).innerHTML = diagHtml(m);
          wireDiag(box);
        }),
    );
    $$('[data-no]', box).forEach(
      (b) =>
        (b.onclick = async () => {
          const [id, cause] = b.dataset.no!.split('|');
          const options = Object.entries(CAUSE_TITLE).filter(([k]) => k !== cause);
          const pick = prompt(`What was it? Type a number:\n${options.map(([, t], i) => `${i + 1}. ${t}`).join('\n')}`);
          const chosen = options[Number(pick) - 1];
          if (!chosen) return;
          await reviews.confirmDiagnosis(id, cause, 'corrected', chosen[0]);
          const m = mistakes.find((x) => x.id === id)!;
          m.diagnosis = (await db.mistakes.get(id))!.diagnosis;
          $(`[data-diag="${id}"]`, box).innerHTML = diagHtml(m);
          wireDiag(box);
        }),
    );
  };

  // ----- blind mode -----
  const setBlind = (on: boolean) => {
    root.classList.toggle('blind', on);
    const bc = $('#blindcard', root);
    if (bc) bc.style.display = on ? '' : 'none';
  };
  const reveal = async (picked: number | null) => {
    blindDone = true;
    setBlind(false);
    const delta = await reviews.recordFindFirst(game.id, picked, truthPly);
    const truthSan = truthPly ? plies[truthPly - 1].san : '';
    const msg =
      picked === null
        ? `You did not spot one. The first big mistake was move ${Math.ceil(truthPly! / 2)} (${truthSan}). That is useful to know: we will practise finding these.`
        : delta === 0
          ? 'Exactly right. You found the first big mistake yourself.'
          : delta! <= cfg.get<number>('review.findFirst.closeDelta')
            ? `Very close: you picked ply ${picked}, it was ply ${truthPly} (${truthSan}). The damage started one move away.`
            : `You picked move ${Math.ceil(picked / 2)}; the first big mistake was move ${Math.ceil(truthPly! / 2)} (${truthSan}). Let us look at why it was hard to see.`;
    toast(msg, delta === 0 ? '' : 'warn', 7000);
    go(truthPly!, true);
  };

  if (useBlind) {
    setBlind(true);
    $('#pick', root).onclick = () => reveal(ply || 1);
    $('#nopick', root).onclick = () => reveal(null);
    $('#showme', root).onclick = async () => {
      blindDone = true;
      setBlind(false);
      await reviews.recordFindFirst(game.id, null, truthPly, 'show_me');
      go(ply, true);
    };
  }

  renderMistakes();
  paintGraph();
  go(startPly && startPly <= plies.length ? startPly : 0, true);
  $('#p-next', root).onclick = () => go(ply + 1);
  $('#p-prev', root).onclick = () => go(ply - 1, true);
  $('#p-start', root).onclick = () => go(0, true);
  $('#p-end', root).onclick = () => go(plies.length, true);
  $('#p-flip', root).onclick = () => board.flip();
  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches('input,textarea,select')) return;
    if (e.key === 'ArrowRight') go(ply + 1);
    else if (e.key === 'ArrowLeft') go(ply - 1, true);
    else if (e.key.toLowerCase() === 'f') board.flip();
  };
  document.addEventListener('keydown', keys);
  let playing: ReturnType<typeof setInterval> | null = null;
  $('#p-play', root).onclick = (e) => {
    const btn = e.target as HTMLElement;
    if (playing) {
      clearInterval(playing);
      playing = null;
      btn.textContent = '▶ Play';
      return;
    }
    btn.textContent = '⏸ Pause';
    playing = setInterval(() => {
      if (ply >= plies.length) {
        clearInterval(playing!);
        playing = null;
        btn.textContent = '▶ Play';
      } else go(ply + 1);
    }, 900);
  };
  const boxbtn = $('#boxbtn', root);
  if (boxbtn && first?.cardId) {
    let on = cardOn;
    boxbtn.onclick = async () => {
      on = !on;
      await reviews.setCardSuspended(first.cardId!, !on);
      boxbtn.textContent = on ? '📦 In your Blunder Box' : '📦 Add to Blunder Box';
      boxbtn.classList.toggle('primary', on);
    };
  }
  $('#rerev', root).onclick = async () => {
    const depth = cfg.get<number>('engine.review.depth') + 4;
    root.innerHTML =
      '<div class="page-h"><div><h1>Re-reviewing…</h1><p class="muted" id="stage">Deeper analysis</p></div></div><section class="card"><div class="bar"><i id="pbar" style="width:3%"></i></div></section>';
    for await (const p of reviews.reviewGame(game.id, { depth })) {
      if (!root.isConnected) return;
      $('#pbar', root).style.width = `${Math.max(3, p.total ? (p.ply / p.total) * 100 : 3)}%`;
    }
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  void metrics;
  void GOOD;
  return () => {
    if (playing) clearInterval(playing);
    document.removeEventListener('keydown', keys);
  };
}
