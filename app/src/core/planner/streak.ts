// Streak logic (docs/backend/05 §8): rest days never break it, freezes cover gaps, no guilt copy.
import { cfg } from '../../config';
import type { Streak } from '../../types/model';

export const newStreak = (): Streak => ({ id: 'me', current: 0, best: 0, freezeLeft: 1, lastDay: '', sinceFreeze: 0 });

const toDate = (d: string) => new Date(`${d}T12:00:00Z`);
export const dayString = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (d: string, n: number) => {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const isRestDay = (d: string, restDay: number) => toDate(d).getUTCDay() === restDay;

/** Non-rest days strictly between `last` and `today` (the days that were missed). */
export function missedDays(last: string, today: string, restDay: number): number {
  if (!last) return 0;
  let n = 0;
  for (let d = addDays(last, 1); d < today; d = addDays(d, 1)) if (!isRestDay(d, restDay)) n++;
  return n;
}

export interface StreakUpdate {
  streak: Streak;
  missed: number;
  freezesUsed: number;
  restarted: boolean;
  welcomeBack: boolean;
}

/** Called when the learner completes a session on `today` (local YYYY-MM-DD). */
export function completeDay(s: Streak, today: string, restDay: number): StreakUpdate {
  if (s.lastDay === today) return { streak: s, missed: 0, freezesUsed: 0, restarted: false, welcomeBack: false };
  const missed = missedDays(s.lastDay, today, restDay);
  let { current, freezeLeft } = s;
  let freezesUsed = 0;
  let restarted = false;
  if (missed > 0) {
    const use = Math.min(missed, freezeLeft);
    if (use >= missed) {
      freezeLeft -= use;
      freezesUsed = use;
    } else {
      restarted = true;
      current = 0;
    }
  }
  current += 1;
  let sinceFreeze = s.sinceFreeze + 1;
  if (sinceFreeze >= cfg.get<number>('streak.freezeEveryDays')) {
    sinceFreeze = 0;
    freezeLeft = Math.min(cfg.get<number>('streak.freezeMax'), freezeLeft + 1);
  }
  return {
    streak: { ...s, current, best: Math.max(s.best, current), freezeLeft, lastDay: today, sinceFreeze },
    missed,
    freezesUsed,
    restarted,
    welcomeBack: missed >= cfg.get<number>('streak.welcomeBackMissedDays'),
  };
}

/** Plain-language label that never scolds. */
export function streakLabel(s: Streak, today: string, restDay: number): string {
  if (!s.lastDay) return 'Your streak starts with your first session.';
  const missed = missedDays(s.lastDay, today, restDay) + (s.lastDay === today ? 0 : 0);
  if (missed > s.freezeLeft) return `Best ${s.best} · current restarting`;
  return `${s.current}-day streak`;
}
