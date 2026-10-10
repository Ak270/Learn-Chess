// Blunder Box (docs/backend/08 §4). Real cards, ladder scheduling, plain "what happens next" after every grade.
import { Chess } from 'chess.js';
import { db, srs } from '../app';
import { Board } from '../components/BoardApi';
import { mountPuzzle } from '../components/PuzzleWidget';
import { skillTitle } from '../core/planner/plan';
import { assistLevel } from '../core/skills/derive';
import { $, $$, esc, toast } from '../shell/dom';
import { settings } from '../shell/settings';
import type { Card } from '../types/model';
import type { SkillId } from '../types/ids';
import { cfg } from '../config';

const DAY = 86_400_000;
const dueLabel = (c: Card, now: number) => {
  if (c.state === 'suspended') return 'paused';
  if (c.state === 'cleared') return c.srs.probe === 'pending' ? 'one check later' : 'cleared';
  const d = Math.ceil((c.srs.dueAt - now) / DAY);
  return c.srs.dueAt <= now ? 'Today' : d === 1 ? 'Tomorrow' : `in ${d} days`;
};

export async function render(root: HTMLElement, ctx: { args: string[] }) {
  if (ctx.args[0]) return drillOne(root, ctx.args[0]);
  const now = Date.now();
  const all = (await db.cards.filter((c) => c.kind === 'blunder').toArray()).sort((a, b) => a.srs.dueAt - b.srs.dueAt);
  const due = await srs.dueCards(now, 'blunder');
  const cleared = all.filter((c) => c.state === 'cleared').length;
  const ladder = cfg.get<number[]>('srs.ladderDays');
  root.innerHTML = `
  <div class="page-h"><div><h1>Blunder Box</h1><p class="muted">Every big mistake becomes a card. It returns after ${ladder.join(', ')} days until you solve it cleanly ${cfg.get<number>('srs.clearedAfterClean')} times.</p></div>
    <button class="btn primary big" id="go" ${due.length ? '' : 'disabled'}>${due.length ? `Review ${due.length} due` : 'Nothing due'}</button></div>
  <div class="grid g3 stagger" style="margin-bottom:16px"><div class="card stat"><div class="small muted">Due today</div><div class="v">${due.length}</div></div><div class="card stat"><div class="small muted">In the box</div><div class="v">${all.length - cleared}</div></div><div class="card stat"><div class="small muted">Cleared</div><div class="v">${cleared}</div></div></div>
  <section class="card"><h2>Your blunders</h2>${
    all.length
      ? all
          .map(
            (
              c,
            ) => `<div class="lesson-row" data-id="${c.id}" style="background:var(--panel2)"><div class="board small" style="--bs:64px;box-shadow:none;border-radius:4px;flex:none" data-fen="${esc(c.fen ?? '')}"></div>
        <div class="grow"><a href="#/blunders/${c.id}" style="color:inherit;text-decoration:none"><b>${esc(c.why.charAt(0).toUpperCase() + c.why.slice(1))}</b></a><div class="small muted">${esc(skillTitle((c.skillTags[0] ?? 'piece_safety') as SkillId))} · next: ${dueLabel(c, now)}</div>
          <div class="ladder" style="margin-top:6px;max-width:260px">${ladder.map((_, i) => `<i class="${i < (c.srs.step ?? 0) ? 'on' : ''}"></i>`).join('')}</div></div>
        <span class="chip ${c.srs.dueAt <= now && c.state !== 'suspended' && c.state !== 'cleared' ? 'red' : ''}">${dueLabel(c, now)}</span>
        <button class="btn small ghost" data-pause="${c.id}" aria-label="${c.state === 'suspended' ? 'Resume' : 'Pause'} this card">${c.state === 'suspended' ? 'Resume' : 'Pause'}</button></div>`,
          )
          .join('')
      : '<p class="muted">Empty for now. Review a game and Mentor will add the mistakes worth learning from.</p>'
  }</section>`;
  $$('[data-fen]', root).forEach((e) => {
    if (e.dataset.fen)
      new Board(e, { chess: new Chess(e.dataset.fen), coords: false, interactive: () => false, animate: false });
  });
  const go = $('#go', root);
  go.onclick = () =>
    queue(
      root,
      due.map((c) => c.id),
    );
  $$('.lesson-row', root).forEach((r) => {
    r.onclick = (e) => {
      if ((e.target as HTMLElement).closest('[data-pause]')) return;
      location.hash = `#/blunders/${r.dataset.id}`;
    };
  });
  $$('[data-pause]', root).forEach(
    (b) =>
      (b.onclick = async () => {
        const c = await db.cards.get(b.dataset.pause!);
        if (!c) return;
        await db.cards.update(c.id, {
          state: c.state === 'suspended' ? (c.srs.lapses || c.srs.cleanStreak ? 'learning' : 'new') : 'suspended',
        });
        toast(
          c.state === 'suspended'
            ? 'Card is back in the box.'
            : 'Card paused. It will not come back until you resume it.',
        );
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }),
  );
}

async function queue(root: HTMLElement, ids: string[]) {
  let i = 0;
  const next = async () => {
    if (i >= ids.length) {
      location.hash = '#/blunders';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    await drill(root, ids[i], i + 1, ids.length, () => {
      i++;
      void next();
    });
  };
  await next();
}

async function drillOne(root: HTMLElement, id: string) {
  await drill(root, id, 1, 1, () => {
    location.hash = '#/blunders';
  });
}

async function drill(root: HTMLElement, cardId: string, n: number, total: number, onNext: () => void) {
  const c = await db.cards.get(cardId);
  if (!c?.fen) {
    toast('That card is gone.');
    onNext();
    return;
  }
  const skill = (c.skillTags[0] ?? 'piece_safety') as SkillId;
  const st = await db.skills.get(skill);
  const level = assistLevel(st?.independence ?? 0);
  root.innerHTML = `<div class="page-h"><div><a href="#/blunders" class="muted small">← Blunder Box</a><h1>${esc(skillTitle(skill))}</h1></div><span class="chip">${n} / ${total}</span></div>
    <div class="card" style="margin-bottom:12px"><div class="small muted">This is a position from <b>your own game</b>. The goal is to repair this exact mistake. ${esc(c.prompt)}</div></div><div id="pz"></div><div id="after"></div>`;
  mountPuzzle(
    $('#pz', root),
    { fen: c.fen, line: c.solution, skill, chips: [skillTitle(skill)], idea: c.why },
    {
      threatStep: level >= 1,
      assistLevel: level,
      onDone: async (r) => {
        const res = await srs.grade(
          c.id,
          { correct: r.correct && !r.gaveUp, hints: r.hints, ms: r.ms },
          { context: 'drill', threatsStated: r.threats },
        );
        const clean = res.result === 'clean';
        $('#after', root).innerHTML =
          `<div class="coach-card ${clean ? '' : 'warn'}" style="margin-top:12px"><h4>${clean ? 'Clean solve' : res.result === 'assisted' ? 'Solved with help' : 'Not this time'}</h4><div class="small">${esc(res.sentence)}</div></div><button class="btn primary" id="n" style="margin-top:8px">${n < total ? 'Next card' : 'Back to box'}</button>`;
        $('#n', root).onclick = onNext;
        void settings;
      },
    },
  );
}
