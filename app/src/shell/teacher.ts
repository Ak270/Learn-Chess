// "Ask Mentor" drawer (docs/backend/07 §4): intent router -> verified answer sources. Chess claims carry a
// "Verified by engine" label; general answers say "Unverified". AI only rewords, and only after the verifier passes.
import { Chess } from 'chess.js';
import { ai, cachedEngine, db, planner, store } from '../app';
import { lineFacts, packageFromStored } from '../core/ai/package';
import { CONCEPT_ALIASES, routeIntent } from '../core/ai/router';
import { lessonById, LESSONS } from '../core/content/lessons';
import { flipWinPct, winPctOf } from '../core/chess/eval';
import { habitFor } from '../core/ai/package';
import { skillTitle } from '../core/planner/plan';
import { $, $$, esc } from './dom';

let ctx: { fen?: string; lastSan?: string } = {};
export const setChatContext = (c: typeof ctx) => (ctx = c);

type Msg = { who: 'me' | 'mentor'; html: string };

export function initTeacher() {
  const t = $('#teacher');
  const fab = $('#teacher-fab');
  const msgs: Msg[] = [
    { who: 'mentor', html: 'Hi! Ask me about your last game, what to practise, or a concept like forks.' },
  ];
  const label = (v: boolean) =>
    `<div class="small muted" style="margin-top:4px">${v ? 'Verified by engine and rules' : 'Unverified general answer'}</div>`;

  async function answer(q: string): Promise<Msg> {
    const route = routeIntent(q, { positionOnScreen: !!ctx.fen });
    if (route.intent === 'greeting') return { who: 'mentor', html: 'Hello! What would you like to look at?' };
    if (route.intent === 'practise') {
      const plan = await planner.planToday().catch(() => undefined);
      if (!plan)
        return {
          who: 'mentor',
          html: `Today is a rest day, so nothing is planned. If you want something small, a few puzzles are a good choice.${label(true)}`,
        };
      return {
        who: 'mentor',
        html: `Today's focus is <b>${esc(skillTitle(plan.focusSkill))}</b>.<br>${(plan.teacherNote ?? []).map((n) => esc(n)).join('<br>')}<br><a href="#/session">Open today's session</a>${label(true)}`,
      };
    }
    if (route.intent === 'why_lost') {
      const games = (await store.gamesNewestFirst(30)).filter((g) => g.reviewedAt);
      for (const g of games) {
        const m = (await store.mistakesForGame(g.id)).find((x) => x.isFirstMeaningful);
        const p = m && (await db.plies.get([g.id, m.ply]));
        if (m && p) {
          const pkg = packageFromStored(m, p);
          const r = await ai.explain(pkg);
          const id = `ai-${Date.now()}`;
          void r.upgrade.then((u) => {
            const el = document.getElementById(id);
            if (u && el)
              el.innerHTML = `${esc(u.text)}<div class="small muted" style="margin-top:4px">Reworded by Groq; every move, square and number was checked against the facts.</div>`;
          });
          return {
            who: 'mentor',
            html: `<span id="${id}">${esc(r.now.text)}${r.now.source === 'ai' ? '<div class="small muted" style="margin-top:4px">Reworded by Groq (checked).</div>' : ''}</span><br><a href="#/review/${g.id}?ply=${m.ply}">Open that position</a>${label(true)}`,
          };
        }
      }
      return {
        who: 'mentor',
        html: 'I do not have a reviewed game yet. Import or play one, and I will find the first mistake that mattered.',
      };
    }
    if (route.intent === 'explain_concept') {
      const key = (route.concept ?? '').replace(/^(an?|the)\s+/, '').trim();
      const skill =
        CONCEPT_ALIASES[key] ??
        (Object.keys(CONCEPT_ALIASES).find((a) => key.includes(a)) &&
          CONCEPT_ALIASES[Object.keys(CONCEPT_ALIASES).find((a) => key.includes(a))!]);
      const lesson = skill ? LESSONS.find((l) => l.skills[0] === skill) : undefined;
      const first = lesson && lessonById(lesson.id)?.steps.find((s) => s.type === 'text');
      if (lesson && first && first.type === 'text')
        return {
          who: 'mentor',
          html: `${esc(first.body)}<br><b>Habit:</b> ${esc(habitFor(skill))}<br><a href="#/learn/${lesson.id}">Open the lesson</a>${label(true)}`,
        };
      return {
        who: 'mentor',
        html: `I do not have a lesson for that yet. I can explain forks, pins, skewers, back-rank mates, hanging pieces and the Safety Check.${label(false)}`,
      };
    }
    if (route.intent === 'is_move_good' && ctx.fen) {
      const san = /\b(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?)\b/.exec(q)?.[1] ?? ctx.lastSan;
      if (!san) return { who: 'mentor', html: 'Which move do you mean? Type it like Nf3.' };
      try {
        const c = new Chess(ctx.fen);
        const before = await cachedEngine.analyse(ctx.fen, { depth: 10, multiPv: 1 });
        const m = c.move(san);
        const after = await cachedEngine.analyse(c.fen(), { depth: 10, multiPv: 1 });
        const loss = Math.max(0, winPctOf(before.lines[0]) - flipWinPct(winPctOf(after.lines[0])));
        const reply = after.lines[0]?.pv[0];
        const lf = lineFacts(
          ctx.fen,
          m.san,
          reply
            ? [new Chess(c.fen()).move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] }).san]
            : [],
        );
        const verdict =
          loss < 5
            ? `${m.san} is fine.`
            : loss < 15
              ? `${m.san} gives up some of your chances.`
              : `${m.san} is a big mistake.`;
        return { who: 'mentor', html: `${esc(verdict)} ${esc(lf.facts.join(' '))}${label(true)}` };
      } catch {
        return { who: 'mentor', html: 'I could not read that move in this position.' };
      }
    }
    return {
      who: 'mentor',
      html: `I can help with your games, what to practise, and chess concepts. I cannot judge a position unless one is on the board.${label(false)}`,
    };
  }

  const open = () => {
    t.hidden = false;
    t.innerHTML = `<header><div class="avatar"><i class="cp wn" style="width:26px;height:26px;margin:0"></i></div><div class="grow"><b>Mentor</b><div class="small muted">Answers come from your games and the engine</div></div><button class="btn small ghost" id="t-close" aria-label="Close">✕</button></header>
      <div class="msgs" id="t-msgs" aria-live="polite"></div>
      <footer><button class="btn small ghost" data-q="Why did I lose?">Why did I lose?</button><button class="btn small ghost" data-q="What should I practise?">What should I practise?</button><button class="btn small ghost" data-q="Explain forks">Explain forks</button>
      <form id="t-form" class="row" style="width:100%"><label for="t-in" class="sr-only" style="position:absolute;left:-9999px">Ask Mentor</label><input type="text" id="t-in" placeholder="Ask Mentor…" autocomplete="off"><button class="btn primary small">Send</button></form></footer>`;
    const box = $('#t-msgs');
    const paint = () => {
      box.innerHTML = msgs
        .map((m) =>
          m.who === 'me'
            ? `<div class="mentor-bubble"><div class="bubble me">${m.html}</div></div>`
            : `<div class="mentor-bubble"><div class="avatar"><i class="cp wn" style="width:26px;height:26px;margin:0"></i></div><div class="bubble">${m.html}</div></div>`,
        )
        .join('');
      box.scrollTop = 1e6;
    };
    paint();
    const ask = async (q: string) => {
      msgs.push({ who: 'me', html: esc(q) });
      paint();
      box.insertAdjacentHTML(
        'beforeend',
        '<div class="mentor-bubble"><div class="avatar"><i class="cp wn" style="width:26px;height:26px;margin:0"></i></div><div class="bubble typing"><i></i><i></i><i></i></div></div>',
      );
      msgs.push(await answer(q));
      paint();
    };
    $$('[data-q]', t).forEach((b) => (b.onclick = () => void ask(b.dataset.q!)));
    $('#t-form').onsubmit = (e) => {
      e.preventDefault();
      const v = ($('#t-in') as HTMLInputElement).value.trim();
      if (v) {
        void ask(v);
        ($('#t-in') as HTMLInputElement).value = '';
      }
    };
    $('#t-close').onclick = () => (t.hidden = true);
  };
  fab.onclick = () => (t.hidden ? open() : (t.hidden = true));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && (t.hidden = true));
}
