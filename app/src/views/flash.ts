// Flash-position exercise UI (docs/backend/10 §4.1). Evidence goes to the `visualization` skill.
import { content, db, store } from '../app';
import { Board } from '../components/BoardApi';
import { Chess } from 'chess.js';
import { FLASH_FALLBACK, nextSeconds, pieceCount, placementOf, scoreFlash, type Placement } from '../core/visual/flash';
import { evidenceFromAttempt } from '../core/skills/derive';
import { $, $$, esc } from '../shell/dom';
import type { SkillId } from '../types/ids';

const GLYPH: Record<string, string> = {
  wk: '',
  wq: '♕',
  wr: '♖',
  wb: '♗',
  wn: '♘',
  wp: '♙',
  bk: '♚',
  bq: '♛',
  br: '♜',
  bb: '♝',
  bn: '♞',
  bp: '♟',
};

async function pickFen(): Promise<string> {
  const skills: SkillId[] = ['piece_safety', 'tactic_fork', 'tactic_pin', 'tactic_backrank'];
  for (let i = 0; i < 12; i++) {
    const p = await content.nextPuzzle({ skill: skills[i % skills.length], excludeIds: [] });
    if (p && pieceCount(p.fen) >= 6 && pieceCount(p.fen) <= 12) return p.fen;
  }
  return FLASH_FALLBACK[Math.floor(Math.random() * FLASH_FALLBACK.length)];
}

export async function runFlash(root: HTMLElement, back: () => void) {
  let seconds = ((await db.kv.get('flash.seconds'))?.value as number | undefined) ?? 8;
  const round = async () => {
    const fen = await pickFen();
    const truth = placementOf(fen);
    root.innerHTML = `<div class="page-h"><div><h1>Flash position</h1><p class="muted">Study the board for ${seconds} seconds, then rebuild it from memory.</p></div><button class="btn ghost" id="back">Back</button></div>
      <div class="game" style="grid-template-columns:auto 1fr"><div id="bd" class="mid" style="--bs:min(520px,86vw)"></div><div class="card" id="side"><p><b id="cd">${seconds}</b> seconds left</p></div></div>`;
    $('#back', root).onclick = back;
    new Board($('#bd', root), { chess: new Chess(fen), orientation: new Chess(fen).turn(), interactive: () => false });
    let left = seconds;
    const t = setInterval(() => {
      left--;
      const cd = $('#cd', root);
      if (cd) cd.textContent = String(left);
      if (left <= 0) {
        clearInterval(t);
        rebuild(fen, truth);
      }
    }, 1000);
  };
  const rebuild = (fen: string, truth: Placement) => {
    const answer: Placement = {};
    let sel = 'wp';
    const files = 'abcdefgh';
    const orient = new Chess(fen).turn();
    const sqs = Array.from({ length: 64 }, (_, i) => {
      const r = orient === 'w' ? 7 - Math.floor(i / 8) : Math.floor(i / 8);
      const f = orient === 'w' ? i % 8 : 7 - (i % 8);
      return `${files[f]}${r + 1}`;
    });
    const paint = () => {
      $('#grid', root).innerHTML = sqs
        .map(
          (s, i) =>
            `<button class="sqb" data-sq="${s}" aria-label="${s}${answer[s] ? ' ' + answer[s] : ''}" style="aspect-ratio:1;font-size:26px;border:0;background:${(Math.floor(i / 8) + (i % 8)) % 2 ? '#739552' : '#ebecd0'};color:#222">${answer[s] ? GLYPH[answer[s]] : ''}</button>`,
        )
        .join('');
      $$('.sqb', root).forEach(
        (b) =>
          (b.onclick = () => {
            const s = b.dataset.sq!;
            if (answer[s] === sel) delete answer[s];
            else answer[s] = sel;
            paint();
          }),
      );
    };
    root.innerHTML = `<div class="page-h"><div><h1>Rebuild the position</h1><p class="muted">Pick a piece, then tap squares. Tap again to remove it.</p></div></div>
      <div class="game" style="grid-template-columns:auto 1fr"><div id="grid" style="display:grid;grid-template-columns:repeat(8,1fr);width:min(480px,86vw)"></div>
      <div class="card"><div class="row" style="flex-wrap:wrap;gap:4px" role="group" aria-label="Pieces">${Object.keys(
        GLYPH,
      )
        .map(
          (k) =>
            `<button class="btn small ${k === sel ? 'primary' : ''}" data-p="${k}" aria-label="${k}" style="font-size:22px">${GLYPH[k]}</button>`,
        )
        .join('')}</div>
      <button class="btn primary" id="done" style="margin-top:12px">I am done</button></div></div>`;
    paint();
    $$('[data-p]', root).forEach(
      (b) =>
        (b.onclick = () => {
          sel = b.dataset.p!;
          $$('[data-p]', root).forEach((x) => x.classList.toggle('primary', x === b));
        }),
    );
    $('#done', root).onclick = async () => {
      const r = scoreFlash(truth, answer);
      const attempt = {
        at: Date.now(),
        context: 'drill' as const,
        fen,
        correct: r.score >= 0.8,
        hints: 0,
        ms: seconds * 1000,
        skillTags: ['visualization' as SkillId],
        source: 'puzzle_recognition' as const,
      };
      await store.recordAttempt(attempt, evidenceFromAttempt({ ...attempt, id: '' }));
      const next = nextSeconds(seconds, r.score);
      await db.kv.put({ key: 'flash.seconds', value: next });
      root.innerHTML = `<div class="page-h"><div><h1>${r.score >= 0.8 ? 'Sharp memory' : 'Good effort'}</h1></div></div><section class="card" style="max-width:520px"><p><b>${r.correct} of ${r.total}</b> pieces on the right square${r.extra ? `, ${r.extra} on a wrong square` : ''}.</p><p class="muted small">${next < seconds ? `Next time you get ${next} seconds.` : next > seconds ? `Next time you get ${next} seconds, so it stays doable.` : 'Same time again.'} Visualisation grows with practice.</p>
        <div class="row"><button class="btn primary" id="again">Another one</button><button class="btn ghost" id="back">Back</button></div></section>`;
      seconds = next;
      $('#again', root).onclick = () => void round();
      $('#back', root).onclick = back;
      void esc;
    };
  };
  await round();
}
