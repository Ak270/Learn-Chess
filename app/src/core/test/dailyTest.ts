// Daily test builder + grading (docs/backend/05 §6). 10 questions: 5 old, 3 of today's skill, 2 traps where the pattern does not apply.
import { cfg } from '../../config';
import type { SkillId } from '../../types/ids';
import type { Attempt, Confidence } from '../../types/model';

export type TestQuestion =
  | {
      kind: 'card';
      id: string;
      cardId: string;
      fen: string;
      prompt: string;
      solution: string[];
      skill: SkillId;
      origin: 'old' | 'today';
      why: string;
    }
  | {
      kind: 'check';
      id: string;
      lessonId: string;
      q: string;
      options: string[];
      answer: number;
      why: string;
      skill: SkillId;
      origin: 'old' | 'today';
    }
  | {
      kind: 'trap';
      id: string;
      fen: string;
      q: string;
      answer: 'yes' | 'no';
      why: string;
      skill: SkillId;
      origin: 'trap';
    };

export interface Pools {
  old: TestQuestion[];
  today: TestQuestion[];
  traps: TestQuestion[];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function shuffle<T>(xs: T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDailyTest(pools: Pools, seed: number, light = false): TestQuestion[] {
  const r = rng(seed);
  const n = light ? 5 : cfg.get<number>('test.questions');
  const want = light
    ? { old: 2, today: 2, traps: 1 }
    : { old: cfg.get<number>('test.old'), today: cfg.get<number>('test.today'), traps: cfg.get<number>('test.traps') };
  const take = (xs: TestQuestion[], k: number) => shuffle(xs, r).slice(0, k);
  let out = [...take(pools.old, want.old), ...take(pools.today, want.today), ...take(pools.traps, want.traps)];
  // top up from whatever pool still has questions so the test is never short while content exists
  const used = new Set(out.map((q) => q.id));
  const rest = shuffle(
    [...pools.today, ...pools.old, ...pools.traps].filter((q) => !used.has(q.id)),
    r,
  );
  while (out.length < n && rest.length) out.push(rest.shift()!);
  out = shuffle(out, r);
  return out.slice(0, n);
}

export type Verdict = 'right_sure' | 'right_unsure' | 'wrong_sure' | 'wrong_unsure';
export interface Graded {
  correct: boolean;
  verdict: Verdict;
  /** wrong and sure = a belief problem, not a slip (docs/backend/05 §6) */
  misconception: boolean;
  brier: number;
}
const CONF = (c: Confidence) => cfg.get<number>(`test.conf.${c}`);

export function gradeAnswer(correct: boolean, confidence: Confidence): Graded {
  const sure = confidence === 'sure';
  return {
    correct,
    verdict: correct ? (sure ? 'right_sure' : 'right_unsure') : sure ? 'wrong_sure' : 'wrong_unsure',
    misconception: !correct && sure,
    brier: Math.pow(CONF(confidence) - (correct ? 1 : 0), 2),
  };
}

export function isCorrect(q: TestQuestion, answer: string | number): boolean {
  if (q.kind === 'card') return q.solution.includes(String(answer));
  if (q.kind === 'check') return Number(answer) === q.answer;
  return answer === q.answer;
}

/** "Your 'sure' answers are right 78% of the time" (honest feedback loop). */
export function calibration(attempts: Pick<Attempt, 'correct' | 'confidence'>[]) {
  const withConf = attempts.filter((a) => a.confidence);
  const sure = withConf.filter((a) => a.confidence === 'sure');
  return {
    n: withConf.length,
    sureN: sure.length,
    sureRight: sure.length ? sure.filter((a) => a.correct).length / sure.length : undefined,
    brier: withConf.length
      ? withConf.reduce((s, a) => s + Math.pow(CONF(a.confidence!) - (a.correct ? 1 : 0), 2), 0) / withConf.length
      : undefined,
  };
}
