// Daily test (docs/backend/05 §6): build from cards, lessons and trap positions; grade with confidence; feed evidence.
import { Chess } from 'chess.js';
import { forkMoves } from '../core/chess/motifs';
import { see } from '../core/chess/see';
import { LESSONS } from '../core/content/lessons';
import {
  buildDailyTest,
  gradeAnswer,
  isCorrect,
  type TestQuestion,
  type Pools,
  type Verdict,
} from '../core/test/dailyTest';
import { evidenceFromAttempt } from '../core/skills/derive';
import type { MentorDB } from '../data/db';
import { repos } from '../data/repos';
import type { SkillId } from '../types/ids';
import type { Confidence } from '../types/model';

export interface SubmittedAnswer {
  questionId: string;
  answer: string | number;
  confidence: Confidence;
  ms: number;
}
export interface TestResult {
  right: number;
  total: number;
  wrongSure: number;
  verdicts: Record<string, Verdict>;
  perSkill: Record<string, { right: number; total: number }>;
  sureRightShare?: number;
}

const hasFreePiece = (fen: string) => {
  const c = new Chess(fen);
  return c.moves({ verbose: true }).some((m) => m.captured && see(fen, m.to, m.color) > 0);
};

export function createTestService(db: MentorDB, now: () => number = Date.now) {
  const r = repos(db);

  async function trapPool(focus: SkillId): Promise<TestQuestion[]> {
    const plies = (await db.plies.toArray()).filter((p) => p.fenBefore && p.cls !== 'book').slice(0, 300);
    const traps: TestQuestion[] = [];
    for (const p of plies) {
      if (traps.length >= 8) break;
      let c: Chess;
      try {
        c = new Chess(p.fenBefore);
      } catch {
        continue;
      }
      if (c.isGameOver() || c.inCheck()) continue;
      if (focus === 'tactic_fork') {
        if (forkMoves(p.fenBefore, c.turn()).length === 0)
          traps.push({
            kind: 'trap',
            id: `trap:${p.gameId}:${p.ply}`,
            fen: p.fenBefore,
            q: `${c.turn() === 'w' ? 'White' : 'Black'} to move. Is there a fork available right now?`,
            answer: 'no',
            why: 'No single move attacks two valuable pieces here. A quiet, safe move is better.',
            skill: focus,
            origin: 'trap',
          });
      } else if (!hasFreePiece(p.fenBefore)) {
        traps.push({
          kind: 'trap',
          id: `trap:${p.gameId}:${p.ply}`,
          fen: p.fenBefore,
          q: `${c.turn() === 'w' ? 'White' : 'Black'} to move. Can you win a piece for free right now?`,
          answer: 'no',
          why: 'Every capture here loses material back. Spotting that stops greedy takes.',
          skill: focus,
          origin: 'trap',
        });
      }
    }
    return traps;
  }

  async function build(o: { focus: SkillId; seed: number; light?: boolean }): Promise<TestQuestion[]> {
    const due = (await db.cards.toArray()).filter((c) => c.state !== 'suspended' && c.fen);
    const cardQ = (c: (typeof due)[number], origin: 'old' | 'today'): TestQuestion => ({
      kind: 'card',
      id: `card:${c.id}`,
      cardId: c.id,
      fen: c.fen!,
      prompt: c.prompt,
      solution: c.solution,
      skill: (c.skillTags[0] ?? o.focus) as SkillId,
      origin,
      why: c.why,
    });
    const checkQs = (skillMatch: (s: string) => boolean, origin: 'old' | 'today'): TestQuestion[] =>
      LESSONS.filter((l) => skillMatch(l.skills[0])).flatMap((l) =>
        l.steps.flatMap((s, i) =>
          s.type === 'check'
            ? [
                {
                  kind: 'check' as const,
                  id: `check:${l.id}:${i}`,
                  lessonId: l.id,
                  q: s.q,
                  options: s.options,
                  answer: s.answer,
                  why: s.why,
                  skill: l.skills[0] as SkillId,
                  origin,
                },
              ]
            : [],
        ),
      );
    const pools: Pools = {
      old: [
        ...due.filter((c) => !c.skillTags.includes(o.focus)).map((c) => cardQ(c, 'old')),
        ...checkQs((s) => s !== o.focus, 'old'),
      ],
      today: [
        ...due.filter((c) => c.skillTags.includes(o.focus)).map((c) => cardQ(c, 'today')),
        ...checkQs((s) => s === o.focus, 'today'),
      ],
      traps: await trapPool(o.focus),
    };
    return buildDailyTest(pools, o.seed, o.light);
  }

  async function submit(questions: TestQuestion[], answers: SubmittedAnswer[]): Promise<TestResult> {
    const res: TestResult = { right: 0, total: 0, wrongSure: 0, verdicts: {}, perSkill: {} };
    let sureN = 0;
    let sureRight = 0;
    for (const a of answers) {
      const q = questions.find((x) => x.id === a.questionId);
      if (!q) continue;
      const ok = isCorrect(q, a.answer);
      const g = gradeAnswer(ok, a.confidence);
      res.total++;
      if (ok) res.right++;
      if (g.misconception) res.wrongSure++;
      if (a.confidence === 'sure') {
        sureN++;
        if (ok) sureRight++;
      }
      res.verdicts[q.id] = g.verdict;
      const ps = (res.perSkill[q.skill] ??= { right: 0, total: 0 });
      ps.total++;
      if (ok) ps.right++;
      const attempt = {
        at: now(),
        context: 'test' as const,
        cardId: q.kind === 'card' ? q.cardId : undefined,
        fen: q.kind !== 'check' ? q.fen : undefined,
        correct: ok,
        hints: 0,
        ms: a.ms,
        confidence: a.confidence,
        skillTags: [q.skill],
        source: 'daily_test' as const,
        trap: q.kind === 'trap',
      };
      await r.recordAttempt(attempt, evidenceFromAttempt({ ...attempt, id: '' }));
      // right but unsure/guess: re-queue the card sooner (docs/backend/05 §6)
      if (q.kind === 'card' && g.verdict === 'right_unsure') {
        const c = await db.cards.get(q.cardId);
        if (c) await db.cards.update(q.cardId, { srs: { ...c.srs, dueAt: Math.min(c.srs.dueAt, now() + 86_400_000) } });
      }
    }
    if (res.wrongSure)
      await db.kv.put({
        key: `misconception.flag:${new Date(now()).toISOString().slice(0, 10)}`,
        value: res.wrongSure,
      });
    res.sureRightShare = sureN ? sureRight / sureN : undefined;
    return res;
  }

  async function miniLessonDue(today: string): Promise<boolean> {
    const y = new Date(`${today}T12:00:00Z`);
    y.setUTCDate(y.getUTCDate() - 1);
    return !!(await db.kv.get(`misconception.flag:${y.toISOString().slice(0, 10)}`));
  }

  return { build, submit, miniLessonDue };
}
export type TestService = ReturnType<typeof createTestService>;
