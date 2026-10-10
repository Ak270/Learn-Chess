// Blunder Box ladder scheduler (docs/backend/05 §4.1): simple and explainable.
import { cfg } from '../../config';
import type { Card } from '../../types/model';

export interface Outcome {
  correct: boolean;
  hints: number;
  ms: number;
}
export type LadderResult = 'clean' | 'assisted' | 'wrong';
const DAY = 86_400_000;

export const classify = (o: Outcome): LadderResult =>
  !o.correct ? 'wrong' : o.hints > 0 || o.ms > cfg.get<number>('srs.cleanMsLimit') ? 'assisted' : 'clean';

/** Human sentence for "what happens next" (shown after every grade). */
export function nextSentence(c: Card, now: number): string {
  if (c.state === 'cleared')
    return c.srs.probe === 'pending' ? 'Cleared! One quick check comes back in a while.' : 'Cleared!';
  const days = Math.max(1, Math.round((c.srs.dueAt - now) / DAY));
  return `Returns in ${days} day${days > 1 ? 's' : ''}.`;
}

export function gradeLadder(card: Card, o: Outcome, now: number): { card: Card; result: LadderResult } {
  const ladder = cfg.get<number[]>('srs.ladderDays');
  const result = classify(o);
  const srs = { ...card.srs, scheduler: 'ladder' as const, lastAt: now };
  let state: Card['state'] = card.state === 'new' ? 'learning' : card.state;
  const step = srs.step ?? 0;

  if (card.state === 'cleared' && card.srs.probe === 'pending') {
    // retention probe: pass keeps it cleared for good, fail reopens it
    if (result === 'clean')
      return { card: { ...card, srs: { ...srs, probe: 'done', dueAt: Number.MAX_SAFE_INTEGER } }, result };
    return {
      card: {
        ...card,
        state: 'learning',
        srs: {
          ...srs,
          step: 0,
          lapses: srs.lapses + 1,
          cleanStreak: 0,
          probe: undefined,
          dueAt: now + cfg.get<number>('srs.assistedRetryDays') * DAY,
        },
      },
      result,
    };
  }
  if (result === 'clean') {
    srs.cleanStreak += 1;
    srs.dueAt = now + ladder[Math.min(step, ladder.length - 1)] * DAY;
    srs.step = Math.min(step + 1, ladder.length);
    if (srs.cleanStreak >= cfg.get<number>('srs.clearedAfterClean')) {
      state = 'cleared';
      srs.probe = 'pending';
      srs.dueAt = now + cfg.get<number>('srs.probeAfterDays') * DAY;
    }
  } else if (result === 'assisted') {
    srs.cleanStreak = 0;
    srs.dueAt = now + cfg.get<number>('srs.assistedRetryDays') * DAY;
  } else {
    srs.cleanStreak = 0;
    srs.step = Math.max(0, step - 1);
    srs.lapses += 1;
    srs.dueAt = now + cfg.get<number>('srs.assistedRetryDays') * DAY;
  }
  return { card: { ...card, state, srs }, result };
}

/** Transfer check: the same motif+skill reappeared in a real game -> reopen at step 0 (docs/backend/05 §4.1). */
export function reopen(card: Card, now: number): Card {
  return {
    ...card,
    state: 'learning',
    srs: { ...card.srs, step: 0, cleanStreak: 0, probe: undefined, dueAt: now, lapses: card.srs.lapses + 1 },
  };
}
