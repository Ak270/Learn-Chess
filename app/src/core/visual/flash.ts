// Visualisation: "flash position" (docs/backend/10 §4). Show a position for N seconds, hide it, the learner rebuilds it.
import { Chess } from 'chess.js';

export type Placement = Record<string, string>; // square -> "wp", "bn", ...

export function placementOf(fen: string): Placement {
  const out: Placement = {};
  for (const row of new Chess(fen).board()) for (const p of row) if (p) out[p.square] = `${p.color}${p.type}`;
  return out;
}
export const pieceCount = (fen: string) => Object.keys(placementOf(fen)).length;

/** score = fraction of the original pieces placed on the right square, minus pieces put on wrong squares (never below 0) */
export function scoreFlash(
  truth: Placement,
  answer: Placement,
): { correct: number; total: number; extra: number; score: number } {
  const total = Object.keys(truth).length;
  const correct = Object.entries(answer).filter(([sq, p]) => truth[sq] === p).length;
  const extra = Object.entries(answer).filter(([sq, p]) => truth[sq] !== p).length;
  return { correct, total, extra, score: Math.max(0, (correct - extra * 0.5) / total) };
}

/** Exposure time: starts at `start` seconds and shrinks while accuracy stays >= 80%, grows back when it does not. */
export function nextSeconds(current: number, lastScore: number, min = 3, max = 12): number {
  if (lastScore >= 0.8) return Math.max(min, current - 1);
  if (lastScore < 0.5) return Math.min(max, current + 2);
  return current;
}

export const FLASH_FALLBACK = [
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
  'r3k2r/ppp2ppp/2n5/3q4/3P4/2N5/PPP2PPP/R2QK2R w KQkq - 0 1',
  '4k3/8/3n4/8/2B5/8/4P3/4K3 w - - 0 1',
];
