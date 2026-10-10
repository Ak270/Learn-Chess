// Spaced repetition service (docs/backend/01 §3 SrsService). One transaction per grade: attempt + evidence + card.
import { cfg } from '../config';
import { evidenceFromAttempt } from '../core/skills/derive';
import { classify, gradeLadder, nextSentence, reopen, type Outcome } from '../core/srs/ladder';
import { gradeFsrs, ratingFor } from '../core/srs/fsrs';
import { capDue } from '../core/srs/caps';
import type { MentorDB } from '../data/db';
import { repos } from '../data/repos';
import { emit } from '../data/bus';
import type { Attempt, AttemptContext, Card, CardKind, Confidence, Mistake } from '../types/model';

const DAY = 86_400_000;

export function createSrsService(db: MentorDB, now: () => number = Date.now) {
  const r = repos(db);

  async function dueCards(at: number = now(), kind?: CardKind, limit = 200): Promise<Card[]> {
    const all = await db.cards.where('srs.dueAt').belowOrEqual(at).toArray();
    return all
      .filter((c) => (kind ? c.kind === kind : true))
      .filter((c) => c.state !== 'suspended' && (c.state !== 'cleared' || c.srs.probe === 'pending'))
      .sort((a, b) => a.srs.dueAt - b.srs.dueAt)
      .slice(0, limit);
  }

  /** cards whose very first attempt happened today (the daily new-card cap counts these) */
  async function newIntroducedToday(): Promise<number> {
    const start = new Date(now());
    start.setHours(0, 0, 0, 0);
    const today = (await db.attempts.where('at').aboveOrEqual(start.getTime()).toArray()).filter((a) => a.cardId);
    let n = 0;
    for (const id of new Set(today.map((a) => a.cardId!))) {
      const earlier = await db.attempts
        .where('cardId')
        .equals(id)
        .filter((a) => a.at < start.getTime())
        .count();
      if (!earlier) n++;
    }
    return n;
  }

  async function todaysQueue(minutes: number, kind?: CardKind) {
    return capDue(await dueCards(now(), kind), minutes, await newIntroducedToday());
  }

  async function grade(
    cardId: string,
    outcome: Outcome,
    ctx: { context?: AttemptContext; confidence?: Confidence; pressedEasy?: boolean; threatsStated?: string[] } = {},
  ): Promise<{ card: Card; sentence: string; result: 'clean' | 'assisted' | 'wrong' }> {
    const card = await db.cards.get(cardId);
    if (!card) throw new Error('Card not found');
    const at = now();
    const gap = card.srs.lastAt ? (at - card.srs.lastAt) / DAY : undefined;
    const useFsrs = card.kind !== 'blunder' && card.kind !== 'tactic';
    const next = useFsrs ? gradeFsrs(card, ratingFor(outcome, ctx), at) : gradeLadder(card, outcome, at).card;
    const attempt: Omit<Attempt, 'id'> = {
      at,
      context: ctx.context ?? 'recall',
      cardId,
      fen: card.fen,
      correct: outcome.correct,
      hints: outcome.hints,
      ms: outcome.ms,
      confidence: ctx.confidence,
      threatsStated: ctx.threatsStated,
      skillTags: card.skillTags,
      source: 'card_review',
      gapDays: gap,
    };
    const evidence = evidenceFromAttempt({ ...attempt, id: '' });
    await r.recordAttempt(attempt, evidence, next);
    emit('card:graded', cardId);
    return { card: next, sentence: nextSentence(next, at), result: classify(outcome) };
  }

  async function addBlunderCard(m: Mistake): Promise<Card | undefined> {
    if (!m.bestUci) return undefined;
    const existing = m.cardId ? await db.cards.get(m.cardId) : undefined;
    if (existing) return existing;
    return r.addCard({
      kind: 'blunder',
      fen: m.fen,
      prompt: 'Find the best move. What did your last move allow?',
      solution: [m.bestUci],
      why: m.motifs[0]?.evidence ?? 'This move cost you a lot of the game.',
      skillTags: m.skillTags,
      sourceRef: { mistakeId: m.id },
      srs: { scheduler: 'ladder', step: 0, dueAt: now(), lapses: 0, cleanStreak: 0 },
      state: 'new',
    });
  }

  /** The motif of a cleared card reappeared in a real game: reopen it (transfer check). */
  async function reopenForSkill(skill: string): Promise<number> {
    const cleared = (await r.cardsBySkill(skill)).filter((c) => c.state === 'cleared');
    for (const c of cleared) await db.cards.put(reopen(c, now()));
    return cleared.length;
  }

  return {
    dueCards,
    todaysQueue,
    grade,
    addBlunderCard,
    reopenForSkill,
    ladderDays: () => cfg.get<number[]>('srs.ladderDays'),
  };
}
export type SrsService = ReturnType<typeof createSrsService>;
