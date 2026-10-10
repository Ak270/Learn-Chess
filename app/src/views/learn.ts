// Learn (docs/backend/08 §4): roadmap from the skill taxonomy + SkillState, lesson list from authored content.
import { content, db } from '../app';
import { mountLesson } from '../components/LessonViewer';
import { LESSONS, lessonById } from '../core/content/lessons';
import { SKILL_DEFS, mastery } from '../core/planner/plan';
import { $, $$, esc } from '../shell/dom';
import { confetti } from '../shell/ui';
import { listModelGames, renderModelGame } from './modelGame';
import type { SkillState, SkillStatus } from '../types/model';

const PHASES: Record<number, string> = {
  0: 'Foundations',
  1: 'Survive & Aware',
  2: 'Tactical Vision',
  3: 'Thinking Process',
  4: 'Opening Basics',
  5: 'Middlegame Plans',
  6: 'Endgame Foundations',
  7: 'Transfer & Consolidation',
};
const solid = (s?: SkillState) => s?.status === 'solid' || s?.status === 'maintenance';

export async function render(root: HTMLElement, ctx: { args: string[] }) {
  if (ctx.args[0] === 'game' && ctx.args[1]) return renderModelGame(root, ctx.args[1]);
  if (ctx.args[0]) return openLesson(root, ctx.args[0]);
  const states = Object.fromEntries((await db.skills.toArray()).map((s) => [s.skill, s]));
  const done = new Set(
    (
      await db.progress
        .where('kind')
        .equals('lesson')
        .filter((p) => p.state === 'done')
        .toArray()
    ).map((p) => p.id),
  );
  const phases = [...new Set(SKILL_DEFS.map((d) => d.phase))].sort();
  let firstOpen = true;
  const nodes = phases.map((ph) => {
    const defs = SKILL_DEFS.filter((d) => d.phase === ph);
    const m = defs.reduce((a, d) => a + mastery(states[d.id]), 0) / defs.length;
    const allSolid = defs.every((d) => solid(states[d.id]));
    const prevDone = phases
      .filter((x) => x < ph)
      .every(
        (x) =>
          SKILL_DEFS.filter((d) => d.phase === x).some(
            (d) => solid(states[d.id]) || (states[d.id]?.nEffTotal ?? 0) > 3,
          ) || x === 0,
      );
    const state = allSolid
      ? 'done'
      : firstOpen && prevDone
        ? ((firstOpen = false), 'current')
        : prevDone
          ? 'next'
          : 'locked';
    return { ph, defs, pct: Math.round(m * 100), state };
  });
  root.innerHTML = `
  <div class="page-h"><div><h1>Learn</h1><p class="muted">One idea at a time. A phase unlocks when your own games show the habit, not when a quiz is passed.</p></div></div>
  <div class="grid g2" style="align-items:start">
    <section class="road stagger">${nodes
      .map(
        (n) => `<div class="node ${n.state}"><div class="dotn">${n.state === 'locked' ? '🔒' : n.ph || '•'}</div>
        <div class="card"><div class="row"><h3 class="grow" style="margin:0">${esc(PHASES[n.ph] ?? `Phase ${n.ph}`)}</h3>${n.state === 'current' ? '<span class="chip green">In progress</span>' : n.state === 'next' ? '<span class="chip blue">Up next</span>' : ''}</div>
        <div class="bar" style="margin:10px 0"><i style="width:${n.pct}%"></i></div>
        <div class="row" style="flex-wrap:wrap;gap:6px">${n.defs.map((d) => `<span class="chip" title="${esc(statusText(states[d.id]?.status))}">${esc(d.title)}</span>`).join('')}</div></div></div>`,
      )
      .join('')}</section>
    <section><h2>Lessons</h2>
      ${LESSONS.map((l) => {
        const isDone = done.has(l.id);
        const locked = l.prereqs.some((p) => !done.has(p));
        return `<div class="lesson-row ${isDone ? 'done' : ''}" data-id="${l.id}" tabindex="0" role="button" aria-disabled="${locked}"><span class="avatar" style="background:${isDone ? 'var(--accent)' : 'var(--panel2)'};color:${isDone ? 'var(--accent-ink)' : 'inherit'}">${isDone ? '✓' : locked ? '🔒' : '▶'}</span>
        <div class="grow"><b>${esc(l.title)}</b><div class="small muted">Phase ${l.phase} · ${l.minutes} min${locked ? ' · finish the earlier lesson first' : ''}</div></div>${!isDone && !locked ? '<span class="chip yellow">New</span>' : ''}</div>`;
      }).join('')}
      <h2 style="margin-top:20px">Think like a stronger player</h2>${listModelGames()
        .map(
          (g) =>
            `<div class="lesson-row"><span class="avatar">♔</span><div class="grow"><a href="#/learn/game/${g.id}" style="color:inherit"><b>${esc(g.title)}</b></a><div class="small muted">${esc(g.sub)}</div></div></div>`,
        )
        .join('')}
      <p class="small muted" style="margin-top:12px">Lessons are written for a 600 to 1000 learner, and every position is checked with the engine. Each lesson is marked "needs owner review" until you have read it.</p>
    </section>
  </div>`;
  $$('.lesson-row', root).forEach((r) => {
    const go = () => {
      if (r.getAttribute('aria-disabled') === 'true') return;
      location.hash = '#/learn/' + r.dataset.id;
    };
    r.onclick = go;
    r.onkeydown = (e) => e.key === 'Enter' && go();
  });
}

const statusText = (s?: SkillStatus) =>
  ({
    insufficient: 'Still learning about you',
    learning: 'Learning',
    solid: 'Solid',
    maintenance: 'Maintained',
    decaying: 'Needs a refresher',
  })[s ?? 'insufficient'];

async function openLesson(root: HTMLElement, id: string) {
  const l = lessonById(id);
  if (!l) {
    root.innerHTML =
      '<div class="page-h"><div><h1>Lesson not found</h1><a href="#/learn">Back to Learn</a></div></div>';
    return;
  }
  mountLesson(root, l, {
    backHref: '#/learn',
    onDone: async () => {
      await content.markLesson(l.id, 'done');
      // lesson cards enter the box as concept cards (a "why" is required)
      for (const c of l.cards) {
        const exists = (await db.cards.toArray()).some((x) => x.kind === 'concept' && x.prompt === c.prompt);
        if (!exists && c.why.trim())
          await db.cards.put({
            id: `concept:${l.id}:${c.prompt.length}:${c.prompt.charCodeAt(0)}`,
            kind: 'concept',
            prompt: c.prompt,
            solution: c.solution,
            why: c.why,
            skillTags: [l.skills[0] as never],
            sourceRef: { lessonId: l.id },
            srs: { scheduler: 'fsrs', dueAt: Date.now(), lapses: 0, cleanStreak: 0 },
            state: 'new',
            createdAt: Date.now(),
          });
      }
      confetti(40);
      location.hash = '#/learn';
    },
  });
  void $;
}
