// Wellbeing rules (docs/backend/10 §5.4): never punitive. Pure so it is easy to test.
import { cfg } from '../../config';

export interface RecentGame {
  score: number; // 1 win, 0.5 draw, 0 loss
  /** median time per learner move in this game, ms (undefined when untimed) */
  medianMoveMs?: number;
}
export type WellbeingAction =
  | { kind: 'none' }
  | { kind: 'break'; message: string; options: ('break' | 'review' | 'lower')[]; highlighted: 'review' }
  | { kind: 'tilt'; message: string };

export function assessAfterGame(recent: RecentGame[]): WellbeingAction {
  let losses = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i].score === 0; i--) losses++;
  const tiltAt = cfg.get<number>('wellbeing.consecutiveLossesTilt');
  const breakAt = cfg.get<number>('wellbeing.consecutiveLossesBreak');
  if (losses >= tiltAt) {
    const last = recent.slice(-tiltAt);
    const times = last.map((g) => g.medianMoveMs).filter((x): x is number => x !== undefined);
    const collapsing = times.length >= 2 && times[times.length - 1] < times[0] * 0.7;
    if (collapsing)
      return {
        kind: 'tilt',
        message:
          'Three tough games in a row, and the moves are getting quicker. That is a good moment to stop for today. How are you feeling?',
      };
  }
  if (losses >= breakAt)
    return {
      kind: 'break',
      message:
        'Two losses in a row happens to everyone. Want to take a five-minute break, review the last game, or play a lower level?',
      options: ['break', 'review', 'lower'],
      highlighted: 'review',
    };
  return { kind: 'none' };
}

/** Fatigue: accuracy in the last third of a session fell by >= 30% against the first third, and times shortened. */
export function fatigued(correct: boolean[], times: number[]): boolean {
  if (correct.length < 9) return false;
  const third = Math.floor(correct.length / 3);
  const rate = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;
  const first = rate(correct.slice(0, third));
  const last = rate(correct.slice(-third));
  const tf = times.slice(0, third).reduce((a, b) => a + b, 0) / third;
  const tl = times.slice(-third).reduce((a, b) => a + b, 0) / third;
  return first > 0 && (first - last) / first >= cfg.get<number>('wellbeing.fatigueAccuracyDrop') && tl < tf;
}
