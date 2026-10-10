// Reusable puzzle widget (puzzles page, Blunder Box, session drills, daily test). Ported from ui/js/views/_puzzle.js.
// Adds multi-move lines, the 4-step hint ladder (docs/backend/05 §7), threat statement step, retry-then-reveal.
import { Chess } from 'chess.js';
import hints from '../content/hints.json';
import { Board } from './BoardApi';
import { esc } from '../shell/dom';
import { confetti, sound } from '../shell/ui';
import { settings } from '../shell/settings';
import type { SkillId } from '../types/ids';

export interface PuzzleSpec {
  fen: string;
  /** UCI: learner, reply, learner, ... */
  line: string[];
  skill: SkillId;
  chips?: string[];
  rating?: number;
  idea?: string;
  lastMove?: { from: string; to: string };
}
export interface PuzzleResult {
  correct: boolean;
  hints: number;
  ms: number;
  threats: string[];
  wrongTries: number;
  gaveUp: boolean;
}
export interface WidgetOpts {
  threatStep?: boolean;
  /** hints offered by default (assistLevel from skill independence) */
  assistLevel?: 0 | 1 | 2 | 3;
  size?: 'mid' | '';
  onDone?: (r: PuzzleResult) => void;
  onWrong?: () => void;
  maxWrong?: number;
  /** disable the hint button (used by tests) */
  noHints?: boolean;
  /** calculation deep-dive: the board stays locked for this long (or until the learner taps "I'm sure") */
  lockMs?: number;
  /** extra gate: the board accepts moves only while this returns true (e.g. a confidence pick is required first) */
  gate?: () => boolean;
}

const IDEAS = hints.ideas as Record<string, string>;
export const hintText = (skill: string) => IDEAS[skill] ?? IDEAS.default;

export function mountPuzzle(root: HTMLElement, p: PuzzleSpec, opts: WidgetOpts = {}) {
  const chess = new Chess(p.fen);
  const side = chess.turn();
  const maxWrong = opts.maxWrong ?? 2;
  let step = 0;
  let nHints = 0;
  let wrong = 0;
  let done = false;
  const t0 = Date.now();
  let threats: string[] = [];
  let phase: 'threats' | 'solve' = opts.threatStep ? 'threats' : 'solve';
  let locked = !!opts.lockMs;

  root.innerHTML = `<div class="board-wrap" style="justify-content:center"><div id="pz-bd" class="${opts.size ?? ''}" role="application" aria-label="Puzzle board"></div></div><div id="pz-msg" style="margin-top:12px" aria-live="polite"></div>`;
  const msg = root.querySelector('#pz-msg') as HTMLElement;
  const q = <T extends HTMLElement>(s: string) => msg.querySelector(s) as T;
  const board = new Board(root.querySelector('#pz-bd') as HTMLElement, {
    chess,
    orientation: side,
    coords: settings.get('coords'),
    interactive: (c) => !done && c === side && phase === 'solve' && !locked && (opts.gate?.() ?? true),
    onUserMove: (mv) => attempt(mv),
  });
  if (p.lastMove) board.setLastMove({ from: p.lastMove.from, to: p.lastMove.to } as never);

  const expected = () => p.line[step * 2];
  const toArrow = (uci: string): [string, string, string] => [uci.slice(0, 2), uci.slice(2, 4), 'green'];

  const showThreatStep = () => {
    msg.innerHTML = `<div class="coach-card info"><h4>🛡 Safety Check first</h4><div class="small" style="margin-bottom:8px">Before you move, tick what you can see in this position.</div>
      <div class="check-list"><label><input type="checkbox" data-t="chk"> A check is available (for either side)</label>
      <label><input type="checkbox" data-t="cap"> A capture is available (for either side)</label>
      <label><input type="checkbox" data-t="thr"> A piece is undefended (either side)</label></div>
      <button class="btn primary small" id="go" style="margin-top:8px">I've looked, let me move</button></div>`;
    q('#go').onclick = () => {
      threats = [...msg.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.dataset.t!);
      phase = 'solve';
      showSolve();
    };
  };
  const showSolve = () => {
    msg.innerHTML = `<div class="row"><b>${side === 'w' ? 'White' : 'Black'} to move</b>${(p.chips ?? []).map((c) => `<span class="chip blue">${esc(c)}</span>`).join('')}${p.rating ? `<span class="chip">~${p.rating}</span>` : ''}<span class="grow"></span>${opts.noHints ? '' : `<button class="btn small ghost" id="hint">💡 Hint (<span id="hn">${nHints}</span>/4)</button>`}</div><div id="fb" style="margin-top:10px"></div>`;
    const h = q('#hint');
    if (h) h.onclick = hint;
    if (locked && opts.lockMs) {
      const lockEl = document.createElement('div');
      lockEl.className = 'coach-card info';
      lockEl.innerHTML = `<h4>Keep looking</h4><div class="small">Work out the whole line before you move. What can they answer? <b id="cd"></b></div><button class="btn small" id="sure" style="margin-top:6px">I'm sure of my line</button>`;
      q('#fb').appendChild(lockEl);
      const end = Date.now() + opts.lockMs;
      const unlock = () => {
        locked = false;
        clearInterval(tick);
        lockEl.remove();
        board.render();
      };
      const tick = setInterval(() => {
        const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        const cd = lockEl.querySelector('#cd');
        if (cd) cd.textContent = `(${left}s)`;
        if (left <= 0) unlock();
      }, 500);
      (lockEl.querySelector('#sure') as HTMLElement).onclick = unlock;
    }
    if ((opts.assistLevel ?? 0) >= 3 && !nHints)
      q('#fb').innerHTML =
        `<div class="coach-card info"><div class="small">Take your time. Hints are there when you want them.</div></div>`;
  };
  // hint ladder: H1 look at their last move, H2 ring the piece, H3 name the idea, H4 reveal the move
  const hint = () => {
    if (done) return;
    nHints = Math.min(4, nHints + 1);
    q('#hn').textContent = String(nHints);
    const mv = expected();
    const texts = [
      'Look at their last move. What does it change?',
      'Look at the piece that is ringed on the board.',
      hintText(p.skill),
      `The move is ${mv.slice(0, 2)}–${mv.slice(2, 4)}.`,
    ];
    q('#fb').innerHTML =
      `<div class="coach-card info"><h4>Hint ${nHints}</h4><div class="small">${esc(texts[nHints - 1])}</div></div>`;
    if (nHints === 2) board.setArrows([[mv.slice(0, 2), mv.slice(0, 2), 'blue']]);
    if (nHints >= 4) board.setArrows([toArrow(mv)]);
  };

  const finish = (correct: boolean, gaveUp = false) => {
    done = true;
    opts.onDone?.({ correct, hints: nHints, ms: Date.now() - t0, threats, wrongTries: wrong, gaveUp });
  };

  const attempt = (mv: { from: string; to: string; promotion?: string }): boolean => {
    if (done) return false;
    const legal = chess
      .moves({ verbose: true })
      .find((m) => m.from === mv.from && m.to === mv.to && (!m.promotion || m.promotion === (mv.promotion || 'q')));
    if (!legal) return false;
    const uci = legal.lan;
    const lastLearnerMove = step * 2 + 1 >= p.line.length;
    const okMove = uci === expected() || (lastLearnerMove && /#$/.test(legal.san));
    if (okMove) {
      chess.move(legal);
      board.applyMove(legal);
      board.setArrows([]);
      sound('good');
      if (lastLearnerMove) {
        confetti(30);
        q('#fb').innerHTML =
          `<div class="coach-card"><h4>✅ Correct: ${esc(legal.san)}</h4><div class="small">${esc(p.idea ?? '')}</div></div>`;
        finish(true);
      } else {
        const reply = p.line[step * 2 + 1];
        step++;
        q('#fb').innerHTML =
          `<div class="coach-card"><h4>✓ ${esc(legal.san)}</h4><div class="small">Good. They answer, and you continue.</div></div>`;
        setTimeout(
          () => {
            if (done) return;
            const r = chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
            board.applyMove(r);
          },
          settings.get('motion') === 'off' ? 0 : 450,
        );
      }
      return true;
    }
    sound('bad');
    wrong++;
    chess.move(legal);
    board.applyMove(legal);
    setTimeout(() => {
      chess.undo();
      board.render();
      board.setLastMove((p.lastMove as never) ?? null);
    }, 650);
    opts.onWrong?.();
    if (wrong > maxWrong) {
      q('#fb').innerHTML =
        `<div class="coach-card bad"><h4>Not quite</h4><div class="small">The move was ${esc(expected().slice(0, 2))}–${esc(expected().slice(2, 4))}. ${esc(p.idea ?? '')} It will come back so you can try again.</div></div>`;
      board.setArrows([toArrow(expected())]);
      finish(false, true);
    } else
      q('#fb').innerHTML =
        `<div class="coach-card bad"><h4>Not quite</h4><div class="small">${esc(legal.san)} does not do the job. What is attacked, and what is protected? ${nHints < 4 ? 'Use a hint if you are stuck.' : ''}</div></div>`;
    return true;
  };

  if (phase === 'threats') showThreatStep();
  else showSolve();
  return {
    board,
    giveUp() {
      if (done) return;
      board.setArrows([toArrow(expected())]);
      finish(false, true);
    },
    destroy() {
      done = true;
    },
  };
}
export type PuzzleHandle = ReturnType<typeof mountPuzzle>;
