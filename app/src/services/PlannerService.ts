// PlannerService (docs/backend/01 §3, docs/backend/05 §5): gathers real inputs, plans, persists, completes days.
import { cfg } from '../config';
import { dayString, completeDay, isRestDay, missedDays, newStreak, type StreakUpdate } from '../core/planner/streak';
import { planSession, type MistakeLite, type PlannerInput } from '../core/planner/plan';
import { noteFacts, noteTemplate, type DayStats } from '../core/teacher/note';
import type { MentorDB } from '../data/db';
import { ulid } from '../data/ulid';
import type { SkillId } from '../types/ids';
import type { GameReview, SessionPlan, Streak } from '../types/model';
import type { ContentService } from './ContentService';
import type { MisconceptionService } from './MisconceptionService';
import type { SrsService } from './SrsService';

export interface BlockResult {
  right?: number;
  total?: number;
  clean?: number;
  wrongSure?: number;
  note?: string;
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

export function createPlannerService(deps: {
  db: MentorDB;
  srs: SrsService;
  content: ContentService;
  misconceptions: MisconceptionService;
  now?: () => number;
}) {
  const { db, srs, content, misconceptions } = deps;
  const now = deps.now ?? Date.now;

  async function getStreak(): Promise<Streak> {
    return (await db.streak.get('me')) ?? newStreak();
  }

  async function restDay(): Promise<number> {
    return (await db.profile.get('me'))?.restDay ?? cfg.get<number>('settings.defaults.restDay');
  }

  async function mistakeInputs(): Promise<{ list: MistakeLite[]; reviewed: number }> {
    const rg = (await db.games.filter((g) => !!g.reviewedAt).toArray()).sort((a, b) => b.startedAt - a.startedAt);
    const last = rg.slice(0, cfg.get<number>('planner.gamesWindow'));
    const list: MistakeLite[] = [];
    for (let gi = 0; gi < last.length; gi++)
      for (const m of await db.mistakes.where('gameId').equals(last[gi].id).toArray())
        list.push({ skillTags: m.skillTags, winPctLoss: m.winPctLoss, gameIdx: gi });
    return { list, reviewed: rg.length };
  }

  async function inputsFor(at: number, minutes: number, o: { light?: boolean } = {}): Promise<PlannerInput> {
    const date = dayString(at);
    const streak = await getStreak();
    const { list, reviewed } = await mistakeInputs();
    const skills = Object.fromEntries((await db.skills.toArray()).map((s) => [s.skill, s]));
    const plans = (await db.plans.orderBy('date').reverse().toArray()).filter((p) => p.date < date);
    let currentFocus: PlannerInput['currentFocus'];
    if (plans[0]) {
      let since = plans[0].createdAt;
      for (const p of plans) {
        if (p.focusSkill !== plans[0].focusSkill) break;
        since = p.createdAt;
      }
      currentFocus = { skill: plans[0].focusSkill, since };
    }
    const q = await srs.todaysQueue(minutes);
    const own = (await db.cards.filter((c) => c.kind === 'blunder' && c.state !== 'suspended').toArray()).sort(
      (a, b) => a.srs.dueAt - b.srs.dueAt,
    );
    return {
      now: at,
      minutes,
      date,
      light: o.light,
      welcomeBack: streak.lastDay
        ? missedDays(streak.lastDay, date, await restDay()) >= cfg.get<number>('streak.welcomeBackMissedDays')
        : false,
      skills: skills as PlannerInput['skills'],
      reviewedGames: reviewed,
      recentMistakes: list,
      currentFocus,
      activeMisconceptionSkills: await misconceptions.activeSkills(),
      dueCards: q.today,
      ownCards: own,
      content: await content.index(),
      seed: hash(date),
    };
  }

  /** Returns undefined on the rest day. An existing plan for today is reused unless `fresh` is set. */
  async function planToday(
    at: number = now(),
    minutes?: number,
    o: { light?: boolean; fresh?: boolean } = {},
  ): Promise<SessionPlan | undefined> {
    const date = dayString(at);
    if (isRestDay(date, await restDay())) return undefined;
    const existing = await db.plans.where('date').equals(date).first();
    if (existing && !o.fresh && !o.light) return existing;
    const prof = await db.profile.get('me');
    const plan = planSession(
      await inputsFor(at, minutes ?? prof?.dailyMinutes ?? cfg.get<number>('planner.defaultMinutes'), o),
    );
    const { scores, ...clean } = plan;
    void scores;
    const saved: SessionPlan = { ...clean, id: existing?.id ?? ulid(at) };
    await db.plans.put(saved);
    return saved;
  }

  async function recordBlockResult(
    planId: string,
    blockId: string,
    result: BlockResult,
  ): Promise<SessionPlan | undefined> {
    const plan = await db.plans.get(planId);
    if (!plan) return undefined;
    const blocks = plan.blocks.map((b) =>
      b.id === blockId ? { ...b, startedAt: b.startedAt ?? now(), doneAt: now(), summary: result } : b,
    );
    const next = { ...plan, blocks };
    await db.plans.put(next);
    return next;
  }

  /** Completes the day: streak, teacher note (template), journal. */
  async function completePlan(planId: string): Promise<{ update: StreakUpdate; note: string[] } | undefined> {
    const plan = await db.plans.get(planId);
    if (!plan) return undefined;
    const rd = await restDay();
    const update = completeDay(await getStreak(), plan.date, rd);
    await db.streak.put(update.streak);
    const sum = (id: string) => plan.blocks.find((b) => b.id === id)?.summary as BlockResult | undefined;
    const t = sum('test');
    const d = sum('drills');
    const rc = sum('recall');
    const stats: DayStats = {
      testRight: t?.right ?? 0,
      testTotal: t?.total ?? 0,
      cardsClean: rc?.clean ?? 0,
      cardsTotal: rc?.total ?? 0,
      drillsRight: d?.right ?? 0,
      drillsTotal: d?.total ?? 0,
      wrongSure: t?.wrongSure ?? 0,
      focus: plan.focusSkill,
      nextFocus: (await planSession(await inputsFor(now() + 86_400_000, plan.minutes))).focusSkill as SkillId,
    };
    const note = noteTemplate(noteFacts(stats));
    await db.journal.put({ id: ulid(now()), at: now(), kind: 'teacher_note', body: note.join(' '), refs: [plan.id] });
    await db.plans.put({ ...plan, completedAt: now(), teacherNote: note });
    return { update, note };
  }

  /** Reviews exist -> misconceptions re-evaluated -> planner sees them. Call after a review job. */
  const refreshAfterReview = () => misconceptions.evaluate();

  return { planToday, recordBlockResult, completePlan, inputsFor, getStreak, refreshAfterReview, restDay };
}
export type PlannerService = ReturnType<typeof createPlannerService>;

export type { GameReview };
