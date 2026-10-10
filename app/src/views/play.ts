// Play (docs/backend/08 §4, docs/backend/07 §2). Lobby + game screen driven by PlayService; Coach mode adds the Safety Check,
// blunder interception with a question, hint ladder and the slow-down lock. Ported from ui/js/views/play.js.
import type { Move } from 'chess.js';
import { Board } from '../components/BoardApi';
import { db, play, reviews } from '../app';
import { cfg } from '../config';
import { LEVELS } from '../core/opponent/levels';
import { fmtClock } from '../core/play/clock';
import { pieceValue } from '../core/chess/material';
import { startJob } from '../services/JobService';
import { GameSession, type PlayMode, type GameConfig } from '../services/PlayService';
import { $, $$, esc, modal, toast } from '../shell/dom';
import { settings } from '../shell/settings';
import { confetti, sound } from '../shell/ui';
import { setChatContext } from '../shell/teacher';
import { assessAfterGame } from '../core/play/wellbeing';
import type { SkillId } from '../types/ids';

const ICONS = ['♟', '♞', '♝', '♜', '♛'];
const GLYPH: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };

export async function render(root: HTMLElement, ctx: { args: string[]; query: URLSearchParams }) {
  let cleanup: (() => void) | undefined;
  const fenParam = ctx.query.get('fen');
  const modeParam = ctx.query.get('mode');
  if (fenParam && modeParam === 'critical') {
    const lvl = (await play.levelEstimate()).recommendation.level.id;
    const s = await play.start({ levelId: lvl, tcIndex: 3, mode: 'critical', color: 'w', startFen: fenParam });
    // the learner plays the side to move in the stored position
    s.meta.me = s.chess.turn();
    await s.save();
    cleanup = game(root, s);
    return () => cleanup?.();
  }
  const active = await play.activeGame();
  await lobby();
  return () => cleanup?.();

  async function lobby() {
    const est = await play.levelEstimate();
    const c: GameConfig = {
      levelId: est.recommendation.level.id,
      tcIndex: 0,
      mode: (settings.get('mode') === 'coach' ? 'coach' : 'normal') as PlayMode,
      color: 'w',
    };
    const tcs = cfg.get<[string, number, number][]>('play.timeControls');
    const focus = ((await db.plans.orderBy('date').reverse().first())?.focusSkill ?? 'piece_safety') as SkillId;
    root.innerHTML = `
    <div class="page-h"><div><h1>Play</h1><p class="muted">Slow games teach more. Coach mode adds the Safety Check; Normal mode stays silent and just records.</p></div></div>
    ${active ? `<section class="card" style="margin-bottom:12px"><b>You have a game in progress.</b> <button class="btn primary small" id="resume">Resume</button></section>` : ''}
    <div class="grid" style="max-width:980px">
      <section><h3>1 · Choose your sparring partner</h3>${est.performance ? `<p class="small muted">${esc(est.performance)}</p>` : ''}<div class="bot-grid stagger">${LEVELS()
        .map(
          (l) => `
        <button class="bot ${l.id === c.levelId ? 'sel' : ''}" data-lv="${l.id}" aria-pressed="${l.id === c.levelId}"><div class="avatar">${ICONS[l.id - 1]}</div><b>${esc(l.name)}</b> <span class="chip">${l.elo}</span>${l.id === est.recommendation.level.id ? `<span class="chip green" style="margin-left:4px">${est.recommendation.challenge ? 'Challenge' : 'Good match'}</span>` : ''}<div class="small muted" style="margin-top:6px">${esc(l.blurb)}</div></button>`,
        )
        .join('')}</div>
        <p class="small muted" style="margin-top:6px">Level numbers are labels until Mentor has seen how you score against them. Realism is weakest below about 1100.</p></section>
      <div class="grid g3">
        <section class="card"><h3>2 · Time</h3><div class="seg" id="tcs" role="group" aria-label="Time control">${tcs.map((t, i) => `<button class="${i === c.tcIndex ? 'on' : ''}" data-tc="${i}">${t[0]}</button>`).join('')}</div><p class="small muted" style="margin-top:8px">Training default is 15+10 or slower. Faster games are for fun and do not drive your plan.</p></section>
        <section class="card"><h3>3 · Mode</h3><div class="seg" id="modes" role="group" aria-label="Mode"><button class="${c.mode === 'coach' ? 'on' : ''}" data-m="coach">🎓 Coach</button><button class="${c.mode === 'normal' ? 'on' : ''}" data-m="normal">♟ Normal</button><button class="${c.mode === 'training' ? 'on' : ''}" data-m="training">🎯 Training</button></div>
          <p class="small muted" style="margin-top:8px" id="mode-d"></p></section>
        <section class="card"><h3>4 · Colour</h3><div class="seg" id="cols" role="group" aria-label="Colour"><button class="on" data-c="w">⬜ White</button><button data-c="b">⬛ Black</button><button data-c="r">🎲 Random</button></div></section>
      </div>
      <div><button class="btn primary big" id="start">Start game</button></div>
    </div>`;
    const modeText = () => {
      $('#mode-d', root).textContent = {
        coach: 'Safety Check before each move, take-back offers with a question, and hints.',
        normal: 'No interruptions. Evidence is saved for your review.',
        training: `Coach mode, and the opponent may leave you a chance to practise ${focus.replace(/_/g, ' ')}. Mentor tells you afterwards when it did.`,
        critical: '',
      }[c.mode];
    };
    modeText();
    $$('[data-lv]', root).forEach(
      (b) =>
        (b.onclick = () => {
          c.levelId = +b.dataset.lv!;
          $$('[data-lv]', root).forEach((x) => {
            x.classList.toggle('sel', x === b);
            x.setAttribute('aria-pressed', String(x === b));
          });
        }),
    );
    const seg = (sel: string, attr: string, fn: (v: string) => void) =>
      $$(`${sel} button`, root).forEach(
        (b) =>
          (b.onclick = () => {
            $$(`${sel} button`, root).forEach((x) => x.classList.toggle('on', x === b));
            fn(b.dataset[attr]!);
          }),
      );
    seg('#tcs', 'tc', (v) => (c.tcIndex = +v));
    seg('#modes', 'm', (v) => {
      c.mode = v as PlayMode;
      if (v !== 'training') settings.set('mode', v === 'coach' ? 'coach' : 'normal');
      modeText();
    });
    seg('#cols', 'c', (v) => (c.color = v as 'w' | 'b' | 'r'));
    $('#start', root).onclick = async () => {
      c.focusSkill = focus;
      cleanup = game(root, await play.start(c));
    };
    const rs = $('#resume', root);
    if (rs)
      rs.onclick = async () => {
        const s = await play.resume(active!);
        if (s) cleanup = game(root, s);
      };
  }
}

function game(root: HTMLElement, s: GameSession): () => void {
  const me = s.me;
  const lv = s.level;
  let view: number | null = null; // viewing history ply index
  let tab: 'moves' | 'coach' | 'info' = 'moves';
  const checklist = { a: false, b: false, c: false };
  const msgs: { k: string; h: string; t: string; act?: string }[] = [
    {
      k: 'info',
      h: 'Welcome',
      t: s.coaching
        ? 'Before each move: what did their last move do? Then checks, captures, threats, theirs first, then yours.'
        : 'No interruptions in this mode. I will show you a review afterwards.',
    },
  ];
  const names = { me: 'You', bot: `${lv.name} (${lv.elo})` };

  root.innerHTML = `
  <div class="game">
    <div class="game-main">
      <div class="playerbar" id="top"></div>
      <div class="board-wrap"><div id="bd" role="application" aria-label="Chess board. Use the mouse or click a piece, then its destination."></div></div>
      <div class="playerbar" id="bot"></div>
      <div id="live" aria-live="polite" style="position:absolute;left:-9999px"></div>
    </div>
    <aside class="side">
      <div class="tabs" style="padding:6px 8px 0;margin:0" role="tablist"><button class="tab active" data-t="moves" role="tab">Moves</button><button class="tab" data-t="coach" role="tab">${s.coaching ? '🎓 Coach' : 'Notes'}</button><button class="tab" data-t="info" role="tab">Game</button></div>
      <div class="body" id="pane"></div>
      <div class="ctrls">
        <button class="btn" id="b-hint" ${s.coaching ? '' : 'disabled'}>💡 Hint</button><button class="btn" id="b-back" ${s.coaching ? '' : 'disabled'}>↩ Take back</button>
        <button class="btn" id="b-flip" aria-label="Flip board (F)">⇅ Flip</button><button class="btn" id="b-draw">½ Draw</button><button class="btn danger" id="b-res">🏳 Resign</button>
      </div>
    </aside>
  </div>`;

  const board = new Board($('#bd', root), {
    chess: s.chess,
    orientation: me,
    coords: settings.get('coords'),
    interactive: (c) => s.canInteract && view === null && c === me,
    onUserMove: (mv) => {
      const legal = s.chess
        .moves({ verbose: true })
        .find((m) => m.from === mv.from && m.to === mv.to && (!m.promotion || m.promotion === (mv.promotion ?? 'q')));
      if (!legal) return false;
      const ticks = Object.values(checklist).filter(Boolean).length;
      void s.userMove({ from: mv.from, to: mv.to, promotion: mv.promotion }, { ticks }).then((res) => {
        if (res.ok && res.move) {
          board.applyMove(res.move);
          Object.keys(checklist).forEach((k) => ((checklist as Record<string, boolean>)[k] = false));
          if (s.coaching && ticks === 3) toast('Safety Check complete. 👏');
          else if (
            s.coaching &&
            s.meta.moves.length > 8 &&
            !ticks &&
            s.moves[s.moves.length - 1].spentMs < cfg.get<number>('coach.rushedNudgeMs')
          )
            toast('Rushed? The Safety Check takes five seconds.', 'warn');
        } else if (res.reason === 'statement-needed') {
          board.render();
          toast('Say what they threaten first.', 'warn');
          tab = 'coach';
          paintPane();
        } else board.render();
      });
      return true;
    },
  });

  const bar = (side: 'w' | 'b', who: string, icon: string) =>
    `<div class="avatar">${icon}</div><div><span class="nm">${esc(who)}</span><div class="row" style="gap:4px"><span class="caps" id="caps-${side}"></span><span class="adv" id="adv-${side}"></span></div></div><div class="clock" id="clk-${side}" role="timer" aria-label="${side === 'w' ? 'White' : 'Black'} clock">--:--</div>`;
  const opp = me === 'w' ? 'b' : 'w';
  $('#top', root).innerHTML = bar(opp, names.bot, ICONS[lv.id - 1]);
  $('#bot', root).innerHTML = bar(me, names.me, '🧑');

  const paintClocks = () =>
    (['w', 'b'] as const).forEach((c) => {
      const e = $(`#clk-${c}`, root);
      if (!e) return;
      const sec = s.clockSeconds(c);
      e.textContent = fmtClock(sec);
      e.classList.toggle('on', !s.over && s.turn === c && s.moves.length > 0);
      e.classList.toggle('low', sec !== Infinity && sec < 30);
    });
  const paintCaptured = () => {
    const got: Record<'w' | 'b', string[]> = { w: [], b: [] };
    for (const m of s.chess.history({ verbose: true })) if (m.captured) got[m.color].push(m.captured);
    (['w', 'b'] as const).forEach((c) => {
      $(`#caps-${c}`, root).textContent = got[c]
        .sort((a, b) => pieceValue(b as 'p') - pieceValue(a as 'p'))
        .map((t) => GLYPH[t])
        .join('');
      const diff =
        got[c].reduce((a, t) => a + pieceValue(t as 'p'), 0) -
        got[c === 'w' ? 'b' : 'w'].reduce((a, t) => a + pieceValue(t as 'p'), 0);
      $(`#adv-${c}`, root).textContent = diff > 0 ? `+${diff}` : '';
    });
  };

  const say = (k: string, h: string, t: string, act = '') => {
    msgs.push({ k, h, t, act });
    if (tab !== 'coach') $$('.tab', root)[1].textContent = (s.coaching ? '🎓 Coach' : 'Notes') + ' •';
    paintPane();
  };
  const goto = (ply: number) => {
    const hist = s.chess.history({ verbose: true });
    view = ply >= hist.length - 1 ? null : ply;
    if (view === null) {
      board.chess = s.chess;
      board.render();
      board.setLastMove(hist[hist.length - 1] ?? null);
    } else {
      const c = new (s.chess.constructor as new (f?: string) => typeof s.chess)(s.meta.startFen);
      hist.slice(0, view + 1).forEach((m) => c.move(m.san));
      board.chess = c;
      board.render();
      board.setLastMove(hist[view]);
    }
    paintPane();
  };

  const paintOffer = () => {
    const o = s.offer;
    if (!o) return '';
    return `<div class="coach-card bad"><h4>Wait, look at that move</h4><div class="small">Your piece on <b>${esc(o.hanging[0].square)}</b> can now be taken. You may take it back, but first: <b>what does the opponent threaten?</b></div>
      <div class="check-list" role="radiogroup" aria-label="What does the opponent threaten?">${o.options.map((op, i) => `<label><input type="radio" name="tb" value="${i}"> ${esc(op.text)}</label>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="btn small primary" id="tb-ok">Answer</button>${o.hintsShown >= 3 ? '<button class="btn small" id="tb-assist">↩ Take it back (with help)</button>' : ''}<button class="btn small ghost" id="tb-keep">Keep my move</button></div></div>`;
  };
  const lockUi = () => {
    if (!s.coaching || s.lockRemaining <= 0 || s.offer) return '';
    const q = s.threatStatementQuestion();
    if (!q) return '';
    return `<div class="coach-card warn"><h4>Slow down: ${s.lockRemaining} more move${s.lockRemaining > 1 ? 's' : ''}</h4><div class="small">Before you move, say what they threaten. It builds the habit.</div>
      <div class="check-list" role="radiogroup" aria-label="Threat statement">${q.options.map((op, i) => `<label><input type="radio" name="ts" value="${i}" data-ok="${op.correct}"> ${esc(op.text)}</label>`).join('')}</div><button class="btn small primary" id="ts-ok">That is what I see</button></div>`;
  };

  const paintPane = () => {
    const pane = $('#pane', root);
    const log = s.moves;
    if (tab === 'moves') {
      let h = '<div class="moves">';
      for (let i = 0; i < log.length; i += 2)
        h +=
          `<div class="n">${i / 2 + 1}</div>` +
          [i, i + 1]
            .map((j) =>
              log[j]
                ? `<div class="m ${(view ?? log.length - 1) === j ? 'cur' : ''}" data-ply="${j}" tabindex="0">${esc(log[j].san)}</div>`
                : '<div></div>',
            )
            .join('');
      pane.innerHTML = log.length
        ? h + '</div>'
        : '<p class="muted">The game has not started. Make your first move.</p>';
      $$('.m', pane).forEach((e) => {
        e.onclick = () => goto(+e.dataset.ply!);
        e.onkeydown = (ev) => ev.key === 'Enter' && goto(+e.dataset.ply!);
      });
      $('.cur', pane)?.scrollIntoView({ block: 'nearest' });
    } else if (tab === 'coach') {
      pane.innerHTML =
        (s.coaching
          ? `<div class="coach-card"><h4>🛡 Safety Check</h4><div class="check-list">
          <label><input type="checkbox" data-k="a" ${checklist.a ? 'checked' : ''}> What did their last move do?</label>
          <label><input type="checkbox" data-k="b" ${checklist.b ? 'checked' : ''}> Checks, captures, threats: theirs, then mine</label>
          <label><input type="checkbox" data-k="c" ${checklist.c ? 'checked' : ''}> Where can their best reply land? Is anything hanging?</label></div>
          <p class="small muted" style="margin:6px 0 0">Tick as you think. It is a habit, not a gate.</p></div>`
          : '') +
        paintOffer() +
        lockUi() +
        msgs
          .slice()
          .reverse()
          .map(
            (m) =>
              `<div class="coach-card ${m.k}"><h4>${esc(m.h)}</h4><div class="small">${esc(m.t)}</div>${m.act ?? ''}</div>`,
          )
          .join('');
      $$<HTMLInputElement>('input[data-k]', pane).forEach(
        (i) => (i.onchange = () => ((checklist as Record<string, boolean>)[i.dataset.k!] = i.checked)),
      );
      const ok = $('#tb-ok', pane);
      if (ok)
        ok.onclick = async () => {
          const v = pane.querySelector<HTMLInputElement>('input[name=tb]:checked');
          if (!v) return toast('Choose what you think they threaten.');
          const r = await s.answerOffer(+v.value);
          if (r.granted) {
            board.chess = s.chess;
            board.render();
            board.setLastMove(s.chess.history({ verbose: true }).at(-1) ?? null);
            board.setArrows([]);
            say('info', 'Take-back granted', 'Good. You saw it. Find a move that keeps everything protected.');
          } else {
            if (r.hint) say('info', `Hint ${s.offer?.hintsShown ?? 3} of 3`, r.hint);
            const hl = s.offer?.hanging[0];
            if (hl && (s.offer?.hintsShown ?? 0) >= 2)
              board.setArrows([[hl.attackerSquare ?? hl.square, hl.square, 'red']]);
            paintPane();
          }
        };
      const keep = $('#tb-keep', pane);
      if (keep)
        keep.onclick = async () => {
          board.setArrows([]);
          await s.keepMove();
          paintPane();
        };
      const assist = $('#tb-assist', pane);
      if (assist)
        assist.onclick = async () => {
          await s.takebackAfterHints();
          board.chess = s.chess;
          board.render();
          board.setArrows([]);
          say('info', 'Take-back granted', 'Marked as assisted. Next time, try the question before the hints.');
        };
      const tsb = $('#ts-ok', pane);
      if (tsb)
        tsb.onclick = async () => {
          const v = pane.querySelector<HTMLInputElement>('input[name=ts]:checked');
          if (!v) return toast('Pick what you think they threaten.');
          await s.answerStatement(v.dataset.ok === 'true');
          toast(
            v.dataset.ok === 'true'
              ? 'Right, you read the position.'
              : 'Not quite. Look at what their last move attacks.',
            v.dataset.ok === 'true' ? '' : 'warn',
          );
          paintPane();
        };
    } else {
      const m = s.meta;
      pane.innerHTML = `<p><b>${esc(names.bot)}</b> vs <b>${esc(names.me)}</b></p><p class="muted small">Mode: ${m.cfg.mode} · Time: ${m.clock.base ? `${m.clock.base / 60}+${m.clock.inc}` : 'untimed'}</p>
        <p class="small">Take-backs used: <b>${m.takebacksUsed}</b> · Hints used: <b>${m.hintsUsed}</b></p>`;
    }
  };
  $$('.tab', root).forEach(
    (b) =>
      (b.onclick = () => {
        $$('.tab', root).forEach((x) => x.classList.toggle('active', x === b));
        tab = b.dataset.t as typeof tab;
        b.textContent = b.textContent!.replace(' •', '');
        paintPane();
      }),
  );

  const sync = () => {
    paintCaptured();
    paintClocks();
    paintPane();
    setChatContext({ fen: s.chess.fen(), lastSan: s.moves.at(-1)?.san });
  };
  const unsub = s.on((e) => {
    if (e === 'move') {
      const m = s.chess.history({ verbose: true }).at(-1) as Move;
      const last = s.moves.at(-1)!;
      if (last.by === 'bot') {
        board.chess = s.chess;
        board.applyMove(m);
      }
      view = null;
      sound(s.chess.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
      $('#live', root).textContent = `${m.color === 'w' ? 'White' : 'Black'} plays ${m.san}`;
    }
    if (e === 'offer') {
      const h = s.offer!.hanging[0];
      board.setArrows(h.attackerSquare ? [[h.attackerSquare, h.square, 'red']] : []);
      sound('bad');
      tab = 'coach';
      $$('.tab', root).forEach((x) => x.classList.toggle('active', x.dataset.t === 'coach'));
    }
    if (e === 'state') {
      board.chess = s.chess;
      board.render();
      board.setLastMove(s.chess.history({ verbose: true }).at(-1) ?? null);
    }
    if (e === 'ended') return void endModal();
    sync();
  });

  const endModal = async () => {
    clearInterval(timer);
    const a = assessAfterGame((await play.results()).map((r) => ({ score: r.score })));
    const wellbeingHtml =
      a.kind === 'none'
        ? ''
        : `<div class="coach-card info"><h4>${a.kind === 'tilt' ? 'Good place to stop' : 'A quick thought'}</h4><div class="small">${esc(a.message)}</div></div>`;
    const sum = s.summary();
    if (sum.won) confetti();
    const title =
      sum.result === '1/2-1/2'
        ? 'Draw'
        : sum.won
          ? sum.termination === 'checkmate'
            ? 'You won by checkmate!'
            : 'You won'
          : sum.termination === 'checkmate'
            ? 'Checkmate'
            : sum.termination === 'time'
              ? 'Out of time'
              : 'You lost';
    const intents = sum.intents.length
      ? `<div class="coach-card info"><h4>I left something on purpose</h4><div class="small">${sum.intents.map((i) => `Move ${Math.ceil(i.ply / 2)}: ${i.kind === 'fork' ? 'a fork chance' : 'a real threat to answer'} (${esc(i.skill.replace(/_/g, ' '))}). Check the review to see whether you found it.`).join('<br>')}</div></div>`
      : '';
    modal(
      `<h2>${esc(title)}</h2><p class="muted">${esc(sum.termination ?? '')}</p>
      <div class="coach-card"><h4>What happened</h4><div class="small">${sum.takebacks ? `${sum.takebacks} take-back${sum.takebacks > 1 ? 's' : ''} used. ` : ''}${sum.hints ? `${sum.hints} hint${sum.hints > 1 ? 's' : ''} used. ` : ''}${sum.interceptions.filter((i) => i.kept).length ? 'You kept a move Mentor flagged; the review will look at it. ' : ''}${sum.reviewable ? 'The review will find the first mistake that really mattered and ask what you were aiming for.' : 'Critical-position games are for practice and are not reviewed.'}</div></div>${intents}${wellbeingHtml}
      <div class="row" style="margin-top:16px">${sum.reviewable ? '<button class="btn primary" id="rv">Review the game</button>' : ''}<button class="btn" id="again">New game</button></div>`,
      {
        onMount: (bg, close) => {
          $('#again', bg).onclick = () => {
            close();
            location.hash = '#/play';
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          };
          const rv = $('#rv', bg);
          if (rv)
            rv.onclick = () => {
              close();
              startJob('Reviewing your game', `#/review/${sum.gameId}`, async ({ signal, update }) => {
                update({ stage: 'Reviewing your game' });
                for await (const _p of reviews.reviewGame(sum.gameId, { signal })) void _p;
                update({ stage: 'Review ready' });
              });
              location.hash = `#/review/${sum.gameId}`;
            };
        },
      },
    );
  };

  const timer = setInterval(() => {
    paintClocks();
    void s.checkClock();
  }, 250);
  $('#b-flip', root).onclick = () => board.flip();
  $('#b-res', root).onclick = () =>
    modal(
      `<h2>Resign this game?</h2><p class="muted">Resigning is fine. You will still get a review.</p><div class="row"><button class="btn danger" id="y">Resign</button><button class="btn" id="n">Keep playing</button></div>`,
      {
        onMount: (bg, close) => {
          $('#n', bg).onclick = close;
          $('#y', bg).onclick = () => {
            close();
            void s.resign();
          };
        },
      },
    );
  $('#b-draw', root).onclick = async () =>
    toast((await s.offerDraw()) ? 'Draw agreed.' : `${lv.name} declines the draw.`);
  $('#b-back', root).onclick = async () => {
    if (!s.coaching) return toast('Take-backs are a Coach-mode feature.');
    if (!(await s.takebackPair())) return toast('No take-back available right now.');
    board.chess = s.chess;
    board.render();
    board.setLastMove(s.chess.history({ verbose: true }).at(-1) ?? null);
    sync();
    toast('Took back your last move.');
  };
  $('#b-hint', root).onclick = async () => {
    if (!s.canInteract) return;
    const h = await s.hint();
    board.setArrows(h.arrows);
    say('info', `Hint ${h.level} of 4`, h.text);
    tab = 'coach';
    $$('.tab', root).forEach((x) => x.classList.toggle('active', x.dataset.t === 'coach'));
    paintPane();
  };
  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches('input,textarea,select')) return;
    const n = s.moves.length;
    if (e.key.toLowerCase() === 'f') board.flip();
    if (e.key === 'ArrowLeft' && n) goto(Math.max(0, (view ?? n - 1) - 1));
    if (e.key === 'ArrowRight' && view !== null) goto(Math.min(n - 1, view + 1));
  };
  document.addEventListener('keydown', keys);
  board.setLastMove(s.chess.history({ verbose: true }).at(-1) ?? null);
  sync();
  if (s.over) endModal();
  return () => {
    clearInterval(timer);
    unsub();
    document.removeEventListener('keydown', keys);
  };
}
