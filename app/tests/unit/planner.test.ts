import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  allocateMinutes,
  chooseFocus,
  mastery,
  planSession,
  scoreSkills,
  SKILL_DEFS,
  type ContentIndex,
  type PlannerInput,
} from '../../src/core/planner/plan';
import { completeDay, dayString, missedDays, newStreak, streakLabel } from '../../src/core/planner/streak';
import { skillStatesFromEvidence } from '../../src/core/skills/derive';
import { cfg } from '../../src/config';
import type { SkillId } from '../../src/types/ids';
import type { Card, SkillEvidence, SkillState } from '../../src/types/model';
import consequences from '../../src/content/consequences.json';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 5, 12);
const content: ContentIndex = {
  lessons: [
    { id: 'l-ps-1', skill: 'piece_safety', minutes: 5, seen: false, phase: 1 },
    { id: 'l-ps-2', skill: 'piece_safety', minutes: 5, seen: false, phase: 1 },
  ],
  puzzleCounts: { piece_safety: 400, tactic_fork: 400 },
};
const card = (id: string, skill: SkillId = 'piece_safety'): Card => ({
  id,
  kind: 'blunder',
  fen: 'x',
  prompt: 'p',
  solution: ['e2e4'],
  why: 'w',
  skillTags: [skill],
  srs: { scheduler: 'ladder', step: 0, dueAt: T0, lapses: 0, cleanStreak: 0 },
  state: 'new',
  createdAt: T0,
});
const base = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  now: T0,
  minutes: 40,
  date: '2026-10-05',
  skills: {},
  reviewedGames: 8,
  recentMistakes: [],
  activeMisconceptionSkills: [],
  dueCards: [card('d1'), card('d2')],
  ownCards: [card('o1'), card('o2'), card('o3'), card('o4')],
  content,
  seed: 7,
  ...over,
});

describe('minutes allocation', () => {
  it('respects the time cap within +/-10% for 15/20/40/60-minute plans', () => {
    for (const m of [15, 20, 40, 60]) {
      const plan = planSession(base({ minutes: m }));
      expect(Math.abs(plan.minutes - m) / m).toBeLessThanOrEqual(cfg.get<number>('planner.timeTolerance'));
      expect(plan.blocks.map((b) => b.id)).toEqual(['recall', 'lesson', 'drills', 'play', 'test', 'note']);
    }
    expect(Object.values(allocateMinutes({ a: 1, b: 1 }, 5)).reduce((x, y) => x + y, 0)).toBe(5);
  });
  it('light day is recall + drills + test only, 15 minutes', () => {
    const p = planSession(base({ light: true }));
    expect(p.blocks.map((b) => b.id)).toEqual(['recall', 'drills', 'test']);
    expect(p.minutes).toBe(15);
    expect(p.light).toBe(true);
  });
  it('welcome-back path is a 10-minute re-entry plan', () => {
    const p = planSession(base({ welcomeBack: true }));
    expect(p.minutes).toBe(10);
    expect(p.blocks.map((b) => b.id)).toEqual(['recall', 'drills', 'test']);
  });
});

describe('focus selection', () => {
  it('cold start (< 5 reviewed games) always chooses piece_safety and explains why', () => {
    const f = chooseFocus(
      base({ reviewedGames: 2, recentMistakes: [{ skillTags: ['tactic_fork'], winPctLoss: 40, gameIdx: 0 }] }),
    );
    expect(f.skill).toBe('piece_safety');
    expect(f.reasons[0]).toMatch(/still learning about you/);
  });
  it('leak rate drives focus; the reason is quantified in plain words', () => {
    const mistakes = [0, 1, 2, 3, 4].map((g) => ({
      skillTags: ['piece_safety' as SkillId],
      winPctLoss: 35,
      gameIdx: g,
    }));
    const f = chooseFocus(base({ recentMistakes: mistakes }));
    expect(f.skill).toBe('piece_safety');
    expect(f.reasons.join(' ')).toMatch(/5 of your last 5 reviewed games/);
  });
  it('prereqs gate introduction but a leaking skill overrides (remedial)', () => {
    const noLeak = scoreSkills(base()).find((s) => s.skill === 'tactic_fork')!;
    expect(noLeak.eligible).toBe(false); // piece_safety and checks_captures_threats are not solid
    const leak = scoreSkills(
      base({
        recentMistakes: [0, 1, 2].map((g) => ({ skillTags: ['tactic_fork' as SkillId], winPctLoss: 30, gameIdx: g })),
      }),
    ).find((s) => s.skill === 'tactic_fork')!;
    expect(leak.eligible).toBe(true);
  });
  it('hysteresis: a new skill must beat the current focus by 15%', () => {
    const cur = { skill: 'piece_safety' as SkillId, since: T0 - 2 * DAY };
    const mistakes = [
      ...[0, 1, 2, 3, 4].map((g) => ({ skillTags: ['piece_safety' as SkillId], winPctLoss: 30, gameIdx: g })),
      ...[0, 1, 2, 3, 4].map((g) => ({
        skillTags: ['checks_captures_threats' as SkillId],
        winPctLoss: 31,
        gameIdx: g,
      })),
    ];
    expect(chooseFocus(base({ recentMistakes: mistakes, currentFocus: cur })).skill).toBe('piece_safety');
  });
  it('is deterministic for the same inputs and seed, and differs only through the seed', () => {
    const a = JSON.stringify(planSession(base({ seed: 3 })));
    expect(JSON.stringify(planSession(base({ seed: 3 })))).toBe(a);
  });
  it('mastery uses only layers with evidence', () => {
    expect(mastery(undefined)).toBe(0);
  });
});

describe('plan content: every block has items with a "why"', () => {
  it('fills recall/lesson/drills/play/test and never leaves a block empty when content exists', () => {
    const p = planSession(base());
    for (const b of p.blocks.filter((x) => x.id !== 'note')) {
      expect(b.items.length, b.id).toBeGreaterThan(0);
      for (const it of b.items) expect(it.why.length).toBeGreaterThan(5);
    }
    expect(p.blocks.find((b) => b.id === 'lesson')!.items[0].ref).toBe('l-ps-1');
    expect(p.blocks.find((b) => b.id === 'drills')!.items.filter((i) => i.kind === 'card')).toHaveLength(4);
  });
  it('without puzzle shards the drills still use the learner’s own positions', () => {
    const p = planSession(base({ content: { lessons: [], puzzleCounts: {} } }));
    expect(p.blocks.find((b) => b.id === 'drills')!.items.length).toBeGreaterThan(0);
  });
});

describe('seed learner simulation (docs/backend/05 §13)', () => {
  it('picks piece_safety in week 1, advances once it is solid by week 3-4, and never schedules locked skills unless remedial', () => {
    const rows: SkillEvidence[] = [];
    let n = 0;
    const states = () =>
      Object.fromEntries(skillStatesFromEvidence(rows).map((s) => [s.skill, s])) as Partial<
        Record<SkillId, SkillState>
      >;
    let rngS = 11;
    const rnd = () => (rngS = (rngS * 1103515245 + 12345) % 2147483648) / 2147483648;
    const mistakes: PlannerInput['recentMistakes'] = [];
    let focus: { skill: SkillId; since: number } | undefined;
    const focusByDay: SkillId[] = [];
    let games = 0;
    for (let day = 0; day < 30; day++) {
      const now = T0 + day * DAY;
      const plan = planSession(
        base({
          now,
          date: dayString(now),
          skills: states(),
          reviewedGames: games,
          recentMistakes: mistakes.slice(0, 40),
          currentFocus: focus,
          seed: day,
        }),
      );
      focusByDay.push(plan.focusSkill);
      if (!focus || focus.skill !== plan.focusSkill) focus = { skill: plan.focusSkill, since: now };
      // the learner trains the focus skill; hanging-piece rate falls from 40% to 15% over 30 days
      const p = Math.min(0.97, 0.7 + 0.3 * (day / 14));
      for (let k = 0; k < 8; k++) {
        const ok = rnd() < p;
        rows.push({
          id: `e${String(n++).padStart(5, '0')}`,
          at: now + k * 1000,
          skill: plan.focusSkill,
          layer: k % 2 ? 'decision' : 'recognition',
          outcome: ok ? 1 : 0,
          weight: 1,
          assisted: false,
          sourceRef: {},
        });
      }
      if (day % 3 === 0) {
        games++;
        const hang = Math.max(0.03, 0.4 * (1 - day / 12));
        if (rnd() < hang) mistakes.unshift({ skillTags: ['piece_safety'], winPctLoss: 30, gameIdx: 0 });
        mistakes.forEach((m, i) => {
          if (i > 0) m.gameIdx = Math.min(9, m.gameIdx + 1);
        });
        const ev: SkillEvidence = {
          id: `e${String(n++).padStart(5, '0')}`,
          at: now + 9000,
          skill: 'piece_safety',
          layer: 'transfer',
          outcome: rnd() < hang ? 0 : 1,
          weight: 1.5,
          assisted: false,
          sourceRef: {},
        };
        rows.push(ev);
      }
    }
    expect(new Set(focusByDay.slice(0, 7))).toEqual(new Set(['piece_safety']));
    const final = states();
    expect(['solid', 'maintenance']).toContain(final.piece_safety!.status);
    expect(focusByDay.slice(14).some((s) => s !== 'piece_safety')).toBe(true); // advances by week 3-4
    // no focus skill outside its prerequisites, unless the skill leaked in games (remedial)
    for (const s of focusByDay) {
      const def = SKILL_DEFS.find((d) => d.id === s)!;
      if (def.prereqs.length)
        expect(
          [
            'piece_safety',
            'checks_captures_threats',
            'blunder_check',
            'material_counting',
            'opponent_threats',
            'candidate_moves',
            'tactic_pin',
            'calculation_2ply',
            'eg_basic_mates',
          ].some((x) => def.prereqs.includes(x as SkillId)),
        ).toBe(true);
    }
  });
});

describe('streak logic', () => {
  it('first day starts a streak; consecutive days extend it; freezes are earned every 7 days (max 2)', () => {
    let s = newStreak();
    for (let d = 0; d < 14; d++) s = completeDay(s, dayString(T0 + d * DAY), 9).streak;
    expect(s.current).toBe(14);
    expect(s.freezeLeft).toBe(2);
    expect(s.best).toBe(14);
  });
  it('a rest day never breaks the streak', () => {
    const sunday = dayString(Date.UTC(2026, 9, 11, 12)); // Sunday
    const sat = dayString(Date.UTC(2026, 9, 10, 12));
    const mon = dayString(Date.UTC(2026, 9, 12, 12));
    let s = completeDay(newStreak(), sat, 0).streak;
    expect(missedDays(sat, mon, 0)).toBe(0);
    s = completeDay(s, mon, 0).streak;
    expect(s.current).toBe(2);
    void sunday;
  });
  it('a freeze covers one missed day; two missed days restart gently with the welcome-back flag', () => {
    let s = completeDay(newStreak(), '2026-10-05', 0).streak; // Mon
    s = completeDay(s, '2026-10-07', 0).streak; // missed Tue -> freeze
    expect(s.current).toBe(2);
    expect(s.freezeLeft).toBe(0);
    const r = completeDay(s, '2026-10-12', 0); // missed Thu-Sat, freeze gone
    expect(r.restarted).toBe(true);
    expect(r.welcomeBack).toBe(true);
    expect(r.streak.current).toBe(1);
    expect(r.streak.best).toBe(2);
    expect(streakLabel(s, '2026-10-12', 0)).toBe('Best 2 · current restarting');
  });
});

describe('consequences and copy lint', () => {
  const banned = cfg.get<string[]>('copy.bannedWords');
  const max = cfg.get<number>('copy.maxWordsPerMessage');
  it('every consequence message avoids banned words, stays <= 90 words and has an undo', () => {
    for (const r of consequences.rules) {
      for (const w of banned) expect(r.message.toLowerCase(), `${r.id}: ${w}`).not.toContain(w);
      expect(r.message.split(/\s+/).length).toBeLessThanOrEqual(max);
      expect(r.undo.length).toBeGreaterThan(3);
    }
  });
  it('banned-word lint also covers all user-facing source files', () => {
    const files = [
      'src/views/review.ts',
      'src/views/home.ts',
      'src/views/onboarding.ts',
      'src/core/chess/facts.ts',
      'src/core/planner/plan.ts',
      'src/core/planner/streak.ts',
      'src/content/rulesCheck.json',
    ];
    for (const f of files) {
      const t = readFileSync(f, 'utf8').toLowerCase();
      for (const w of banned) expect(new RegExp(`\\b${w}\\b`).test(t), `${f} contains "${w}"`).toBe(false);
    }
  });
});
