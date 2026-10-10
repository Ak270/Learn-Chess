// Today's Session (docs/backend/08 §4): the six blocks from the real plan. Persists after every block; "Save and leave" is safe.
import { content, db, planner, srs, store, tests } from '../app';
import { LessonViewerHost } from './sessionLesson';
import { mountPuzzle } from '../components/PuzzleWidget';
import { skillTitle } from '../core/planner/plan';
import { calibration, type TestQuestion } from '../core/test/dailyTest';
import { assistLevel, evidenceFromAttempt } from '../core/skills/derive';
import { dayString, isRestDay, streakLabel } from '../core/planner/streak';
import { $, $$, esc, toast } from '../shell/dom';
import { confetti } from '../shell/ui';
import type { SubmittedAnswer } from '../services/TestService';
import type { SkillId } from '../types/ids';
import type { Card, Confidence, PlanBlock, SessionPlan } from '../types/model';

const META: Record<PlanBlock['id'], { icon: string; title: string }> = {
  recall: { icon: '🧠', title: 'Warm-up recall' },
  lesson: { icon: '📖', title: "Today's lesson" },
  drills: { icon: '🎯', title: 'Guided drills' },
  play: { icon: '♟️', title: 'Play block' },
  test: { icon: '📝', title: 'Daily test' },
  note: { icon: '💬', title: 'Teacher note' },
};

export async function render(root: HTMLElement) {
  const now = Date.now();
  const rd = await planner.restDay();
  if (isRestDay(dayString(now), rd)) {
    root.innerHTML = `<div class="page-h"><div><h1>Rest day</h1><p class="muted">No plan today, and your streak is safe.</p></div></div><section class="card"><p>Rest is part of training. If you feel like it, play a relaxed game or look at a puzzle.</p><div class="row"><a class="btn" href="#/play">Free play</a><a class="btn ghost" href="#/puzzles">A few puzzles</a></div></section>`;
    return;
  }
  let plan = (await planner.planToday(now))!;
  let idx = Math.max(
    0,
    plan.blocks.findIndex((b) => !b.doneAt),
  );
  if (plan.blocks.every((b) => b.doneAt)) idx = plan.blocks.length;
  const streak = await planner.getStreak();

  const frame = (inner: string) => {
    root.innerHTML = `
    <div class="page-h"><div><h1>Today's Session</h1><p class="muted">One focus: <b>${esc(skillTitle(plan.focusSkill))}</b>. Take your time: accuracy beats speed. ${esc(streakLabel(streak, plan.date, rd))}</p></div>
      <div class="row">${plan.light ? '' : '<button class="btn ghost" id="light">Light day (15 min)</button>'}<a class="btn ghost" href="#/home">Save and leave</a></div></div>
    <div class="grid" style="grid-template-columns:260px 1fr;align-items:start">
      <div><div class="steps">${plan.blocks.map((b, i) => `<div class="step ${b.doneAt || i < idx ? 'done' : i === idx ? 'cur' : ''}"><span class="ic">${META[b.id].icon}</span><div><b>${META[b.id].title}</b><div class="small muted">${b.targetMin} min</div></div><span class="tick">${b.doneAt || i < idx ? '✓' : ''}</span></div>`).join('')}</div>
        <details class="card" style="margin-top:12px"><summary><b>Why this focus?</b></summary>${(plan.teacherNote ?? []).map((n) => `<p class="small" style="margin-top:6px">${esc(n)}</p>`).join('')}</details></div>
      <section class="card" id="stage">${inner}</section></div>`;
    const light = $('#light', root);
    if (light)
      light.onclick = async () => {
        plan = (await planner.planToday(now, undefined, { light: true }))!;
        idx = 0;
        show();
      };
  };

  const finishBlock = async (block: PlanBlock, summary: Parameters<typeof planner.recordBlockResult>[2]) => {
    plan = (await planner.recordBlockResult(plan.id, block.id, summary)) as SessionPlan;
    idx = plan.blocks.findIndex((b) => !b.doneAt);
    if (idx < 0) idx = plan.blocks.length;
    show();
  };

  const show = () => {
    const b = plan.blocks[idx];
    if (!b) return void finish();
    if (b.id === 'recall') return void recall(b);
    if (b.id === 'lesson') return void lessonBlock(b);
    if (b.id === 'drills') return void drills(b);
    if (b.id === 'play') return playBlock(b);
    if (b.id === 'test') return void test(b);
    void note(b);
  };

  // ---- recall ----
  async function recall(b: PlanBlock) {
    const cards = (await Promise.all(b.items.filter((i) => i.kind === 'card').map((i) => db.cards.get(i.ref)))).filter(
      (c): c is Card => !!c,
    );
    if (!cards.length)
      return frame(emptyBlock('Nothing is due for recall today.', () => void finishBlock(b, { right: 0, total: 0 })));
    let i = 0;
    let clean = 0;
    const paint = async () => {
      if (i >= cards.length) return void finishBlock(b, { right: clean, total: cards.length, clean });
      const c = cards[i];
      const why = b.items.find((x) => x.ref === c.id)?.why ?? '';
      frame(
        `<div class="chip">Card ${i + 1} / ${cards.length}</div><p class="small muted" style="margin-top:8px">${esc(why)}</p><div id="host"></div>`,
      );
      const host = $('#host', root);
      if (c.fen && c.solution[0]?.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(c.solution[0])) {
        const skill = (c.skillTags[0] ?? 'piece_safety') as SkillId;
        const level = assistLevel((await db.skills.get(skill))?.independence ?? 0);
        mountPuzzle(
          host,
          { fen: c.fen, line: c.solution, skill, chips: [skillTitle(skill)], idea: c.why },
          {
            threatStep: level >= 1,
            assistLevel: level,
            onDone: async (r) => {
              const res = await srs.grade(
                c.id,
                { correct: r.correct && !r.gaveUp, hints: r.hints, ms: r.ms },
                { context: 'recall' },
              );
              if (res.result === 'clean') clean++;
              host.insertAdjacentHTML(
                'beforeend',
                `<div class="coach-card" style="margin-top:12px"><div class="small">${esc(res.sentence)}</div></div><button class="btn primary" id="n" style="margin-top:8px">Next</button>`,
              );
              $('#n', host).onclick = () => {
                i++;
                void paint();
              };
            },
          },
        );
      } else {
        const t0 = Date.now();
        host.innerHTML = `<h2 style="margin-top:12px">${esc(c.prompt)}</h2><p class="muted">Answer in your head first.</p><div id="ans"></div><button class="btn primary" id="rev">Show answer</button>`;
        $('#rev', host).onclick = () => {
          $('#ans', host).innerHTML =
            `<div class="coach-card"><h4>Answer</h4><div class="small">${esc(c.solution.join(' '))}</div><div class="small muted" style="margin-top:4px">${esc(c.why)}</div></div><div class="conf" style="margin-top:8px"><button class="btn" data-g="good">Got it</button><button class="btn" data-g="hard">Almost</button><button class="btn" data-g="again">Forgot</button></div>`;
          $('#rev', host).remove();
          $$('[data-g]', host).forEach(
            (g) =>
              (g.onclick = async () => {
                const grade = g.dataset.g!;
                const res = await srs.grade(
                  c.id,
                  { correct: grade !== 'again', hints: grade === 'hard' ? 1 : 0, ms: Date.now() - t0 },
                  { context: 'recall' },
                );
                if (res.result === 'clean') clean++;
                i++;
                void paint();
              }),
          );
        };
      }
    };
    await paint();
  }

  const emptyBlock = (text: string, onNext: () => void) => {
    queueMicrotask(() => ($('#skipb', root).onclick = onNext));
    return `<p>${esc(text)}</p><button class="btn primary" id="skipb">Continue</button>`;
  };

  // ---- lesson ----
  async function lessonBlock(b: PlanBlock) {
    const item = b.items[0];
    if (!item)
      return frame(emptyBlock('No new lesson today. Your practice carries the load.', () => void finishBlock(b, {})));
    if (item.kind === 'lesson') {
      frame('<div id="lv"></div>');
      return void LessonViewerHost($('#lv', root), item.ref, async () => {
        await content.markLesson(item.ref, 'done');
        void finishBlock(b, {});
      });
    }
    frame(emptyBlock(item.why, () => void finishBlock(b, {})));
  }

  // ---- drills ----
  async function drills(b: PlanBlock) {
    type Task = { kind: 'card'; card: Card } | { kind: 'puzzle'; skill: SkillId };
    const tasks: Task[] = [];
    for (const it of b.items) {
      if (it.kind === 'card') {
        const c = await db.cards.get(it.ref);
        if (c) tasks.push({ kind: 'card', card: c });
      } else if (it.ref.startsWith('query:')) {
        const [, s, n] = it.ref.split(':');
        for (let k = 0; k < Number(n); k++)
          tasks.push({ kind: 'puzzle', skill: (s === 'mixed' ? plan.focusSkill : s) as SkillId });
      }
    }
    if (!tasks.length)
      return frame(
        emptyBlock(
          'No drills available yet. Review a game or install the puzzle shards.',
          () => void finishBlock(b, { right: 0, total: 0 }),
        ),
      );
    let i = 0;
    let ok = 0;
    let clean = 0;
    const seen: string[] = [];
    const paint = async () => {
      if (i >= tasks.length) return void finishBlock(b, { right: ok, total: tasks.length, clean });
      const t = tasks[i];
      frame(
        `<div class="row"><b>Drill ${i + 1} / ${tasks.length}</b><span class="grow"></span><span class="chip green">${clean} clean</span></div><div id="pz"></div><div id="after"></div>`,
      );
      let spec: Parameters<typeof mountPuzzle>[1] | undefined;
      let skill: SkillId;
      let card: Card | undefined;
      let pzRating = 0;
      if (t.kind === 'card' && t.card.fen) {
        card = t.card;
        skill = (card.skillTags[0] ?? plan.focusSkill) as SkillId;
        spec = { fen: card.fen!, line: card.solution, skill, chips: [skillTitle(skill)], idea: card.why };
      } else {
        skill = (t.kind === 'puzzle' ? t.skill : plan.focusSkill) as SkillId;
        const pz = await content.nextPuzzle({ skill, excludeIds: seen });
        if (!pz) {
          i++;
          return void paint();
        }
        seen.push(pz.id);
        pzRating = pz.rating;
        spec = {
          fen: pz.fen,
          line: pz.line,
          skill,
          chips: pz.themes.slice(0, 2),
          rating: pz.rating,
          lastMove: pz.lastMove,
          idea: `Theme: ${pz.themes.slice(0, 3).join(', ')}.`,
        };
      }
      const level = assistLevel((await db.skills.get(skill))?.independence ?? 0);
      mountPuzzle($('#pz', root), spec, {
        threatStep: level >= 1,
        assistLevel: level,
        onDone: async (r) => {
          const correct = r.correct && !r.gaveUp;
          if (correct) ok++;
          if (correct && !r.hints && r.wrongTries === 0) clean++;
          if (card)
            await srs.grade(
              card.id,
              { correct, hints: r.hints, ms: r.ms },
              { context: 'drill', threatsStated: r.threats },
            );
          else {
            const attempt = {
              at: Date.now(),
              context: 'puzzle' as const,
              correct,
              hints: r.hints,
              ms: r.ms,
              skillTags: [skill],
              source: 'puzzle_recognition' as const,
              threatsStated: r.threats,
            };
            await store.recordAttempt(attempt, evidenceFromAttempt({ ...attempt, id: '' }));
            await content.recordPuzzleResult(pzRating, correct && !r.hints);
          }
          $('#after', root).innerHTML =
            `<button class="btn primary" id="n" style="margin-top:12px">${i < tasks.length - 1 ? 'Next drill' : 'Finish drills'}</button>`;
          $('#n', root).onclick = () => {
            i++;
            void paint();
          };
        },
      });
    };
    await paint();
  }

  // ---- play ----
  function playBlock(b: PlanBlock) {
    frame(`<h2>♟️ Play block</h2><p>${esc(b.items[0]?.why ?? 'One slow game.')}</p><div class="coach-card warn"><h4>Today's rule</h4><div class="small">If you blunder a piece, you may take it back, but only after naming the threat.</div></div>
      <a class="btn primary big" href="#/play${b.items[0]?.ref.startsWith('critical:') ? '?mode=critical' : ''}">Go to the board</a> <button class="btn ghost" id="skip">I played elsewhere (continue)</button>`);
    $('#skip', root).onclick = () => void finishBlock(b, { note: 'played elsewhere' });
  }

  // ---- test ----
  async function test(b: PlanBlock) {
    const qs = await tests.build({
      focus: plan.focusSkill,
      seed: Number(plan.date.replace(/-/g, '')),
      light: plan.light,
    });
    if (!qs.length)
      return frame(
        emptyBlock(
          'Not enough material for a test yet. It grows with your Blunder Box and lessons.',
          () => void finishBlock(b, { right: 0, total: 0 }),
        ),
      );
    const answers: SubmittedAnswer[] = [];
    let q = 0;
    const paint = () => {
      if (q >= qs.length) return void submit();
      const t = qs[q];
      let conf: Confidence | undefined;
      frame(`<div class="row"><b>Question ${q + 1} / ${qs.length}</b><span class="grow"></span><span class="chip">${t.origin === 'trap' ? 'a trap: the pattern may not be there' : t.origin === 'old' ? 'older material' : 'today’s skill'}</span></div>
        <div id="conf" class="coach-card info" style="margin:12px 0"><h4>How sure are you?</h4><div class="conf" role="group" aria-label="Confidence"><button class="btn" data-c="sure">Sure</button><button class="btn" data-c="unsure">Unsure</button><button class="btn" data-c="guess">Guess</button></div><div class="small muted" style="margin-top:4px">Pick before you answer. It is how Mentor learns what you truly know.</div></div><div id="qa"></div><div id="after"></div>`);
      $$('[data-c]', root).forEach(
        (bt) =>
          (bt.onclick = () => {
            conf = bt.dataset.c as Confidence;
            $$('[data-c]', root).forEach((x) => x.classList.toggle('on', x === bt));
          }),
      );
      const t0 = Date.now();
      const next = (answer: string | number) => {
        answers.push({ questionId: t.id, answer, confidence: conf ?? 'unsure', ms: Date.now() - t0 });
        q++;
        paint();
      };
      const qa = $('#qa', root);
      if (t.kind === 'card') {
        mountPuzzle(
          qa,
          { fen: t.fen, line: [t.solution[0]], skill: t.skill, chips: [skillTitle(t.skill)], idea: t.why },
          {
            noHints: true,
            maxWrong: 0,
            gate: () => !!conf,
            onDone: (r) => {
              $('#after', root).innerHTML = `<button class="btn primary" id="n" style="margin-top:12px">Next</button>`;
              $('#n', root).onclick = () => next(r.correct ? t.solution[0] : 'wrong');
            },
          },
        );
        if (!conf)
          $('#conf', root).insertAdjacentHTML(
            'beforeend',
            '<div class="small" style="margin-top:6px">The board unlocks once you pick how sure you are.</div>',
          );
      } else if (t.kind === 'check') {
        qa.innerHTML = `<p><b>${esc(t.q)}</b></p>${t.options.map((o, k) => `<label style="display:block;margin:6px 0"><input type="radio" name="o" value="${k}"> ${esc(o)}</label>`).join('')}<button class="btn primary" id="sub">Answer</button>`;
        $('#sub', qa).onclick = () => {
          const v = qa.querySelector<HTMLInputElement>('input:checked');
          if (!v) return toast('Choose an answer first.');
          if (!conf) return toast('Pick how sure you are first.');
          next(Number(v.value));
        };
      } else {
        qa.innerHTML = `<p><b>${esc(t.q)}</b></p><div class="row"><button class="btn" data-a="yes">Yes</button><button class="btn" data-a="no">No</button></div>`;
        $$('[data-a]', qa).forEach(
          (a) =>
            (a.onclick = () => {
              if (!conf) return toast('Pick how sure you are first.');
              next(a.dataset.a!);
            }),
        );
        // a board to look at (read-only)
        void import('../components/BoardApi').then(async ({ Board }) => {
          const { Chess } = await import('chess.js');
          const div = document.createElement('div');
          qa.prepend(div);
          const bd = new Board(div, {
            chess: new Chess(t.fen),
            orientation: new Chess(t.fen).turn(),
            interactive: () => false,
          });
          void bd;
        });
      }
    };
    const submit = async () => {
      const res = await tests.submit(qs as TestQuestion[], answers);
      const cal = calibration((await db.attempts.where('context').equals('test').toArray()).slice(-60));
      const lines = qs
        .map(
          (qq, k) =>
            `<div class="small" style="margin:4px 0">${k + 1}. ${res.verdicts[qq.id] === 'right_sure' ? '✅ Right and sure' : res.verdicts[qq.id] === 'right_unsure' ? '🟡 Right, but unsure' : res.verdicts[qq.id] === 'wrong_sure' ? '🔶 Sure, but missed' : '⚪ Missed (you were unsure)'} <span class="muted">${esc(qq.why)}</span></div>`,
        )
        .join('');
      frame(
        `<h2>Test results</h2><p><b>${res.right} of ${res.total}</b> right.${cal.sureRight !== undefined && cal.sureN >= 3 ? ` Your "sure" answers are right ${Math.round(cal.sureRight * 100)}% of the time.` : ''}</p>${res.wrongSure ? '<div class="coach-card warn"><h4>Sure and wrong is the most useful signal</h4><div class="small">Tomorrow starts with a three-minute look at why.</div></div>' : ''}${lines}<button class="btn primary" id="fin">Continue</button>`,
      );
      $('#fin', root).onclick = () =>
        void finishBlock(b, { right: res.right, total: res.total, wrongSure: res.wrongSure });
    };
    paint();
  }

  // ---- note + finish ----
  async function note(b: PlanBlock) {
    const done = await planner.completePlan(plan.id);
    const lines = done?.note ?? [];
    await finishBlock(b, { note: lines.join(' ') });
    plan = (await db.plans.get(plan.id)) ?? plan;
    void lines;
  }
  function finish() {
    confetti(80);
    const lines = plan.teacherNote ?? [];
    frame(
      `<div style="text-align:center;padding:20px 0"><div style="font-size:64px">🔥</div><h1>Session complete</h1><div class="mentor-bubble" style="text-align:left"><div class="avatar">♞</div><div class="bubble">${lines.map((n) => `• ${esc(n)}`).join('<br>')}</div></div><a class="btn primary big" href="#/home" style="margin-top:12px">Back home</a></div>`,
    );
  }
  show();
}
