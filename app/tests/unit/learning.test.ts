import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MentorDB } from '../../src/data/db';
import { repos } from '../../src/data/repos';
import { rebuildDerived } from '../../src/data/derived';
import { exportAll, importAll } from '../../src/data/exportImport';
import {
  assistLevel,
  evidenceFromAttempt,
  independenceOf,
  skillStatesFromEvidence,
} from '../../src/core/skills/derive';
import { classify, gradeLadder, nextSentence } from '../../src/core/srs/ladder';
import { gradeFsrs, ratingFor } from '../../src/core/srs/fsrs';
import { capDue } from '../../src/core/srs/caps';
import { createSrsService } from '../../src/services/SrsService';
import type { Attempt, Card, SkillEvidence } from '../../src/types/model';
import { seedAttempts } from '../fixtures/seedLearner';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 10, 12);
const card = (over: Partial<Card> = {}): Card => ({
  id: 'c1',
  kind: 'blunder',
  fen: 'x',
  prompt: 'p',
  solution: ['e2e4'],
  why: 'w',
  skillTags: ['piece_safety'],
  srs: { scheduler: 'ladder', step: 0, dueAt: T0, lapses: 0, cleanStreak: 0 },
  state: 'new',
  createdAt: T0,
  ...over,
});
const clean = { correct: true, hints: 0, ms: 5000 };
const wrong = { correct: false, hints: 0, ms: 5000 };
const assisted = { correct: true, hints: 1, ms: 5000 };

describe('ladder scheduler (table-driven, docs/backend/05 §13)', () => {
  it('classifies outcomes', () => {
    expect(classify(clean)).toBe('clean');
    expect(classify(assisted)).toBe('assisted');
    expect(classify({ correct: true, hints: 0, ms: 61_000 })).toBe('assisted'); // slower than cleanMsLimit
    expect(classify(wrong)).toBe('wrong');
  });
  const seqs: {
    name: string;
    outcomes: ('c' | 'a' | 'w')[];
    after: { step: number; streak: number; days: number; state: Card['state']; lapses: number };
  }[] = [
    { name: 'one clean', outcomes: ['c'], after: { step: 1, streak: 1, days: 1, state: 'learning', lapses: 0 } },
    { name: 'two clean', outcomes: ['c', 'c'], after: { step: 2, streak: 2, days: 3, state: 'learning', lapses: 0 } },
    {
      name: 'clean then wrong steps back',
      outcomes: ['c', 'c', 'w'],
      after: { step: 1, streak: 0, days: 1, state: 'learning', lapses: 1 },
    },
    {
      name: 'assisted keeps the step',
      outcomes: ['c', 'a'],
      after: { step: 1, streak: 0, days: 1, state: 'learning', lapses: 0 },
    },
    {
      name: 'wrong at step 0 stays at 0',
      outcomes: ['w'],
      after: { step: 0, streak: 0, days: 1, state: 'learning', lapses: 1 },
    },
    {
      name: 'three clean clears',
      outcomes: ['c', 'c', 'c'],
      after: { step: 3, streak: 3, days: 45, state: 'cleared', lapses: 0 },
    },
    {
      name: 'a miss resets the clean streak',
      outcomes: ['c', 'c', 'w', 'c', 'c'],
      after: { step: 3, streak: 2, days: 7, state: 'learning', lapses: 1 },
    },
  ];
  for (const s of seqs)
    it(s.name, () => {
      let c = card();
      let now = T0;
      for (const o of s.outcomes) {
        c = gradeLadder(c, o === 'c' ? clean : o === 'a' ? assisted : wrong, now).card;
        now = c.srs.dueAt;
      }
      now = c.srs.lastAt!;
      expect(c.srs.step).toBe(s.after.step);
      expect(c.srs.cleanStreak).toBe(s.after.streak);
      expect(Math.round((c.srs.dueAt - now) / DAY)).toBe(s.after.days);
      expect(c.state).toBe(s.after.state);
      expect(c.srs.lapses).toBe(s.after.lapses);
    });
  it('cleared cards return once as a probe; passing keeps them cleared, failing reopens them', () => {
    let c = card();
    for (let i = 0; i < 3; i++) c = gradeLadder(c, clean, c.srs.dueAt).card;
    expect(c.srs.probe).toBe('pending');
    const pass = gradeLadder(c, clean, c.srs.dueAt).card;
    expect(pass.state).toBe('cleared');
    expect(pass.srs.probe).toBe('done');
    const fail = gradeLadder(c, wrong, c.srs.dueAt).card;
    expect(fail.state).toBe('learning');
    expect(fail.srs.step).toBe(0);
  });
  it('says plainly what happens next', () => {
    const c = gradeLadder(card(), clean, T0).card;
    expect(nextSentence(c, T0)).toBe('Returns in 1 day.');
  });
});

describe('FSRS', () => {
  it('maps outcomes to ratings and never schedules the same day', () => {
    expect(ratingFor(wrong)).toBe('again');
    expect(ratingFor(assisted)).toBe('hard');
    expect(ratingFor(clean)).toBe('good');
    expect(ratingFor(clean, { pressedEasy: true, confidence: 'sure' })).toBe('easy');
    expect(ratingFor(clean, { pressedEasy: true, confidence: 'unsure' })).toBe('good');
    let c = card({ kind: 'opening', srs: { scheduler: 'fsrs', dueAt: T0, lapses: 0, cleanStreak: 0 } });
    c = gradeFsrs(c, 'good', T0);
    expect(c.srs.dueAt).toBeGreaterThanOrEqual(T0 + DAY);
    const long = gradeFsrs(c, 'good', c.srs.dueAt);
    expect(long.srs.dueAt - c.srs.dueAt).toBeGreaterThan(c.srs.dueAt - T0); // intervals grow
    const lapsed = gradeFsrs(long, 'again', long.srs.dueAt);
    expect(lapsed.srs.lapses).toBe(1);
    expect(lapsed.srs.cleanStreak).toBe(0);
  });
  it('is deterministic (no fuzz)', () => {
    const a = gradeFsrs(card({ kind: 'concept' }), 'good', T0);
    const b = gradeFsrs(card({ kind: 'concept' }), 'good', T0);
    expect(a.srs.dueAt).toBe(b.srs.dueAt);
  });
});

describe('daily caps', () => {
  it('caps new cards at 5 and reviews at minutes x 1.5, oldest first, with a kind message', () => {
    const due = Array.from({ length: 30 }, (_, i) =>
      card({
        id: `n${i}`,
        state: 'new',
        srs: { scheduler: 'ladder', dueAt: T0 - i * 1000, lapses: 0, cleanStreak: 0 },
      }),
    );
    const q = capDue(due, 15);
    expect(q.today.filter((c) => c.state === 'new')).toHaveLength(5);
    expect(q.today.length).toBeLessThanOrEqual(22);
    expect(q.message).toMatch(/waiting; today we do the 5 that matter/);
    expect(q.message).not.toMatch(/overdue|behind|late/i);
  });
});

describe('evidence mapping (docs/backend/05 §3.1)', () => {
  const att = (o: Partial<Attempt>): Attempt => ({
    id: 'a',
    at: T0,
    context: 'puzzle',
    correct: true,
    hints: 0,
    ms: 1,
    skillTags: ['piece_safety'],
    ...o,
  });
  it('hints halve to 0.4 and mark assisted; sure+wrong weighs 1.5x; guess+right counts 0.5', () => {
    expect(evidenceFromAttempt(att({}))[0]).toMatchObject({
      layer: 'recognition',
      weight: 1,
      outcome: 1,
      assisted: false,
    });
    expect(evidenceFromAttempt(att({ hints: 1 }))[0]).toMatchObject({ weight: 0.4, assisted: true });
    expect(evidenceFromAttempt(att({ correct: false, confidence: 'sure' }))[0].weight).toBe(1.5);
    expect(evidenceFromAttempt(att({ confidence: 'guess' }))[0].outcome).toBe(0.5);
  });
  it('routes by source and adds a retention row after a >= 7 day gap', () => {
    expect(evidenceFromAttempt(att({ source: 'lesson_check' }))[0]).toMatchObject({ layer: 'knowledge', weight: 0.5 });
    expect(evidenceFromAttempt(att({ source: 'critical_drill' }))[0]).toMatchObject({ layer: 'decision', weight: 1.5 });
    expect(evidenceFromAttempt(att({ source: 'calc_deepdive' }))[0]).toMatchObject({
      layer: 'calculation',
      weight: 1.5,
    });
    const rows = evidenceFromAttempt(att({ source: 'card_review', gapDays: 9 }));
    expect(rows.map((r) => r.layer).sort()).toEqual(['recognition', 'retention']);
    expect(evidenceFromAttempt(att({ source: 'card_review', gapDays: 3 }))).toHaveLength(1);
    expect(evidenceFromAttempt(att({ source: 'daily_test', trap: true }))[0].layer).toBe('decision');
  });
});

describe('skill state (Beta posterior, decay, status)', () => {
  const ev = (
    i: number,
    layer: SkillEvidence['layer'],
    outcome: 0 | 1,
    over: Partial<SkillEvidence> = {},
  ): SkillEvidence => ({
    id: `e${String(i).padStart(3, '0')}`,
    at: T0 + i * 1000,
    skill: 'piece_safety',
    layer,
    outcome,
    weight: 1,
    assisted: false,
    sourceRef: {},
    ...over,
  });
  it('cold start: insufficient until nEff >= 6', () => {
    const s = skillStatesFromEvidence([ev(0, 'recognition', 1), ev(1, 'recognition', 1)]);
    expect(s[0].status).toBe('insufficient');
    expect(s[0].layers.recognition.n).toBeCloseTo(2, 3);
  });
  it('mean/nEff follow alpha/beta with weights', () => {
    const s = skillStatesFromEvidence([ev(0, 'recognition', 1, { weight: 2 }), ev(1, 'recognition', 0, { weight: 1 })]);
    expect(s[0].layers.recognition.mean).toBeCloseTo(3 / 5, 3); // a=1+2, b=1+1
    expect(s[0].layers.recognition.n).toBeCloseTo(3, 3);
  });
  it('old evidence decays with a 30-day half-life', () => {
    const old = ev(0, 'recognition', 1, { at: T0 });
    const recent = ev(1, 'recognition', 1, { at: T0 + 30 * DAY });
    const s = skillStatesFromEvidence([old, recent])[0];
    expect(s.layers.recognition.n).toBeCloseTo(1.5, 6); // 1*0.5 + 1
  });
  it('solid needs recognition, decision, independence, transfer-not-contradicted and nEff >= 10; then maintenance after 14 days', () => {
    const rows: SkillEvidence[] = [];
    for (let i = 0; i < 6; i++) rows.push(ev(i, 'recognition', 1));
    for (let i = 6; i < 12; i++) rows.push(ev(i, 'decision', 1));
    expect(skillStatesFromEvidence(rows)[0].status).toBe('solid');
    for (let i = 12; i < 22; i++)
      rows.push(ev(i, i % 2 ? 'decision' : 'recognition', 1, { at: T0 + 15 * DAY + i * 1000 }));
    expect(skillStatesFromEvidence(rows)[0].status).toBe('maintenance');
  });
  it('assisted answers do not count toward independence', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ev(i, 'recognition', 1, { assisted: true, weight: 0.4 }));
    expect(independenceOf(rows)).toBe(0);
    expect(assistLevel(0)).toBe(3);
    expect(assistLevel(0.5)).toBe(2);
    expect(assistLevel(0.7)).toBe(1);
    expect(assistLevel(0.9)).toBe(0);
  });
  it('a transfer miss after being solid makes the skill decaying', () => {
    const rows: SkillEvidence[] = [];
    for (let i = 0; i < 6; i++) rows.push(ev(i, 'recognition', 1));
    for (let i = 6; i < 12; i++) rows.push(ev(i, 'decision', 1));
    rows.push(ev(12, 'transfer', 0, { weight: 2 }));
    expect(skillStatesFromEvidence(rows)[0].status).toBe('decaying');
  });
  it('shows a transfer gap only with enough evidence in both layers', () => {
    const rows: SkillEvidence[] = [];
    for (let i = 0; i < 6; i++) rows.push(ev(i, 'recognition', 1));
    expect(skillStatesFromEvidence(rows)[0].transferGap).toBeUndefined();
    for (let i = 6; i < 12; i++) rows.push(ev(i, 'transfer', 0));
    expect(skillStatesFromEvidence(rows)[0].transferGap).toBeGreaterThan(0.4);
  });
});

describe('rebuildDerived + export/import keep skills identical (docs/backend/05 §13)', () => {
  it('rebuild is idempotent; import into an empty DB then rebuild gives identical skills', async () => {
    const db = new MentorDB('lrn1');
    await db.attempts.bulkAdd(seedAttempts());
    await rebuildDerived(db);
    const a = await db.skills.orderBy('skill').toArray();
    await rebuildDerived(db);
    expect(await db.skills.orderBy('skill').toArray()).toEqual(a);
    const db2 = new MentorDB('lrn2');
    await importAll(db2, JSON.parse(JSON.stringify(await exportAll(db2.name === 'x' ? db : db))));
    await rebuildDerived(db2);
    expect(await db2.skills.orderBy('skill').toArray()).toEqual(a);
  });
});

describe('SrsService', () => {
  it('grades in one transaction: attempt + evidence + card, reopens on transfer, and probes', async () => {
    const db = new MentorDB('srs1');
    let t = T0;
    const srs = createSrsService(db, () => t);
    const r = repos(db);
    const c = await r.addCard({
      kind: 'blunder',
      fen: 'x',
      prompt: 'p',
      solution: ['e2e4'],
      why: 'w',
      skillTags: ['piece_safety'],
      srs: { scheduler: 'ladder', step: 0, dueAt: t, lapses: 0, cleanStreak: 0 },
      state: 'new',
    });
    expect((await srs.dueCards()).map((x) => x.id)).toEqual([c.id]);
    const g1 = await srs.grade(c.id, clean);
    expect(g1.sentence).toBe('Returns in 1 day.');
    expect(await db.attempts.count()).toBe(1);
    expect((await db.evidence.toArray()).length).toBe(1);
    expect(await srs.dueCards()).toHaveLength(0);
    for (let i = 0; i < 2; i++) {
      t = (await db.cards.get(c.id))!.srs.dueAt;
      await srs.grade(c.id, clean);
    }
    expect((await db.cards.get(c.id))!.state).toBe('cleared');
    expect(await srs.dueCards(t + 10 * DAY)).toHaveLength(0);
    expect(await srs.dueCards(t + 46 * DAY)).toHaveLength(1); // probe
    expect(await srs.reopenForSkill('piece_safety')).toBe(1);
    expect((await db.cards.get(c.id))!.state).toBe('learning');
  });
  it('FSRS kinds (opening) use FSRS and record retention evidence after a long gap', async () => {
    const db = new MentorDB('srs2');
    let t = T0;
    const srs = createSrsService(db, () => t);
    const c = await repos(db).addCard({
      kind: 'opening',
      fen: 'x',
      prompt: 'p',
      solution: ['e4'],
      why: 'centre',
      skillTags: ['opening_repertoire_recall'],
      srs: { scheduler: 'fsrs', dueAt: t, lapses: 0, cleanStreak: 0 },
      state: 'new',
    });
    await srs.grade(c.id, clean);
    t += 10 * DAY;
    await srs.grade(c.id, clean);
    expect((await db.evidence.toArray()).some((e) => e.layer === 'retention')).toBe(true);
    expect((await db.cards.get(c.id))!.srs.scheduler).toBe('fsrs');
  });
});
