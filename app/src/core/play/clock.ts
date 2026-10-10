// Clocks run from stored timestamps, not intervals, so a refresh never loses time (docs/backend/08 §4 Play).
export interface ClockState {
  base: number; // seconds, 0 = untimed
  inc: number;
  remaining: { w: number; b: number }; // seconds at `turnStartedAt`
  turn: 'w' | 'b';
  turnStartedAt: number; // ms epoch; 0 when the clock is not running yet
  running: boolean;
}
export const newClock = (base: number, inc: number): ClockState => ({
  base,
  inc,
  remaining: { w: base, b: base },
  turn: 'w',
  turnStartedAt: 0,
  running: false,
});

export function remainingNow(c: ClockState, color: 'w' | 'b', now: number): number {
  if (!c.base) return Infinity;
  if (!c.running || c.turn !== color) return c.remaining[color];
  return Math.max(0, c.remaining[color] - (now - c.turnStartedAt) / 1000);
}
/** The side that just moved pays elapsed time and gains the increment; the other side's clock starts. */
export function press(c: ClockState, mover: 'w' | 'b', now: number, startRunning: boolean): ClockState {
  const next: ClockState = {
    ...c,
    remaining: { ...c.remaining },
    turn: mover === 'w' ? 'b' : 'w',
    turnStartedAt: now,
    running: c.running || startRunning,
  };
  if (c.base && c.running) next.remaining[mover] = Math.max(0, remainingNow(c, mover, now)) + c.inc;
  return next;
}
export const fmtClock = (s: number) =>
  s === Infinity ? '∞' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const flagged = (c: ClockState, now: number): 'w' | 'b' | undefined =>
  (['w', 'b'] as const).find((col) => c.base > 0 && c.running && remainingNow(c, col, now) <= 0);
