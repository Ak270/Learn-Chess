// Evaluation maths (docs/backend/03 §2). All constants come from config/chess.json with sources.
import { cfg } from '../../config';

export type Score = { cp?: number; mate?: number };

/** Centipawns from one side's point of view -> that side's win percentage (0-100). */
export function winPct(cp: number): number {
  const k = cfg.get('eval.winPctK');
  return 50 + 50 * (2 / (1 + Math.exp(-k * cp)) - 1);
}
/** Engine score (side-to-move view) -> cp, mate saturating at +/-mateCp. */
export function scoreToCp(s: Score): number {
  if (s.mate !== undefined) return Math.sign(s.mate || 1) * cfg.get('eval.mateCp');
  return s.cp ?? 0;
}
export const winPctOf = (s: Score) => winPct(scoreToCp(s));
/** Opponent just moved and the engine scored the position for its side to move -> flip to the mover. */
export const flipWinPct = (w: number) => 100 - w;

export function winPctLoss(beforeMover: number, afterMover: number) {
  return Math.max(0, beforeMover - afterMover);
}
export function moveAccuracy(loss: number) {
  const a = cfg.get('accuracy.a');
  const k = cfg.get('accuracy.k');
  const b = cfg.get('accuracy.b');
  return Math.min(100, Math.max(0, a * Math.exp(-k * loss) + b));
}
export const gameAccuracy = (accs: number[]) => (accs.length ? accs.reduce((s, x) => s + x, 0) / accs.length : 0);
