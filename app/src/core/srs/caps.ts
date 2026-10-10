// Daily caps (docs/backend/05 §4.2): never a guilt number, always "today we do the N that matter".
import { cfg } from '../../config';
import type { Card } from '../../types/model';

export interface CappedQueue {
  today: Card[];
  waiting: number;
  newToday: number;
  message: string;
}
export function capDue(due: Card[], minutes: number, newIntroducedToday = 0): CappedQueue {
  const maxReviews = Math.max(1, Math.floor(minutes * cfg.get<number>('srs.reviewsPerMinute')));
  const maxNew = Math.max(0, cfg.get<number>('srs.newCardsPerDay') - newIntroducedToday);
  const sorted = [...due].sort((a, b) => a.srs.dueAt - b.srs.dueAt || a.createdAt - b.createdAt); // oldest first
  const today: Card[] = [];
  let news = 0;
  for (const c of sorted) {
    if (today.length >= maxReviews) break;
    if (c.state === 'new') {
      if (news >= maxNew) continue;
      news++;
    }
    today.push(c);
  }
  const waiting = due.length - today.length;
  return {
    today,
    waiting,
    newToday: news,
    message:
      waiting > 0
        ? `${due.length} cards are waiting; today we do the ${today.length} that matter.`
        : `${today.length} card${today.length === 1 ? '' : 's'} today.`,
  };
}
