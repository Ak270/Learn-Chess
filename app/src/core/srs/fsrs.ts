// FSRS scheduling for opening/concept/endgame cards via ts-fsrs (docs/backend/05 §4.2).
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard } from 'ts-fsrs';
import { cfg } from '../../config';
import type { Card, Confidence } from '../../types/model';
import type { Outcome } from './ladder';

const DAY = 86_400_000;
const scheduler = () =>
  fsrs(
    generatorParameters({
      request_retention: cfg.get('srs.fsrs.retention'),
      maximum_interval: cfg.get('srs.fsrs.maxIntervalDays'),
      enable_fuzz: false, // deterministic scheduling (tests, rebuildDerived)
      enable_short_term: false, // daily app: no minute-level learning steps
    }),
  );

interface Stored extends Omit<FsrsCard, 'due' | 'last_review'> {
  due: string;
  last_review?: string;
}
const toStored = (c: FsrsCard): Stored => ({
  ...c,
  due: c.due.toISOString(),
  last_review: c.last_review?.toISOString(),
});
const fromStored = (s: Stored): FsrsCard =>
  ({ ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined }) as FsrsCard;

export type FsrsGrade = 'again' | 'hard' | 'good' | 'easy';
/** Outcome -> FSRS rating (docs/backend/05 §4.2). `easy` is only reachable when the learner pressed Easy. */
export function ratingFor(o: Outcome, opts: { confidence?: Confidence; pressedEasy?: boolean } = {}): FsrsGrade {
  if (!o.correct) return 'again';
  if (o.hints > 0 || o.ms > cfg.get<number>('srs.fsrs.slowMs')) return 'hard';
  if (opts.pressedEasy && opts.confidence === 'sure') return 'easy';
  return 'good';
}
const R = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;

export function gradeFsrs(card: Card, grade: FsrsGrade, now: number): Card {
  const f = scheduler();
  const prev = card.srs.fsrs ? fromStored(card.srs.fsrs as Stored) : createEmptyCard(new Date(card.createdAt));
  const { card: next } = f.next(prev, new Date(now), R[grade]);
  const dueAt = Math.max(next.due.getTime(), now + DAY); // never due again the same day
  return {
    ...card,
    state: card.state === 'new' ? 'learning' : card.state,
    srs: {
      ...card.srs,
      scheduler: 'fsrs',
      fsrs: toStored(next),
      dueAt,
      lastAt: now,
      lapses: next.lapses,
      cleanStreak: grade === 'again' ? 0 : card.srs.cleanStreak + (grade === 'hard' ? 0 : 1),
    },
  };
}
