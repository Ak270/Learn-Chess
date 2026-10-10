// Human-like move sampling over engine candidates (docs/backend/07 §1.2): softmax on centipawn loss plus a "blunder pool"
// of natural-looking mistakes. Pure, seeded, testable without an engine.
import { cfg } from '../../config';
import type { Level } from './levels';

export interface Candidate {
  uci: string;
  /** centipawns from the mover's point of view (mate mapped to +/-mateCp by the caller) */
  cp: number;
}
export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export interface SampleCtx {
  /** false for moves a human at this level would not play (e.g. hanging the queen to a pawn) */
  plausible?: (uci: string) => boolean;
}

export function sampleMove(cands: Candidate[], level: Level, rng: Rng, ctx: SampleCtx = {}): Candidate | undefined {
  if (!cands.length) return undefined;
  const best = Math.max(...cands.map((c) => c.cp));
  const withLoss = cands.map((c) => ({ ...c, loss: best - c.cp }));
  if (rng() < level.pBlunder) {
    const lo = cfg.get<number>('blunderPool.minLossCp');
    const hi = cfg.get<number>('blunderPool.maxLossCp');
    const pool = withLoss.filter((c) => c.loss >= lo && c.loss <= hi && (ctx.plausible?.(c.uci) ?? true));
    if (pool.length) return pool[Math.floor(rng() * pool.length)];
  }
  const ok = withLoss.filter((c) => ctx.plausible?.(c.uci) ?? true);
  const pick = ok.length ? ok : withLoss;
  const w = pick.map((c) => Math.exp(-c.loss / level.temperature));
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pick.length; i++) {
    r -= w[i];
    if (r <= 0) return pick[i];
  }
  return pick[pick.length - 1];
}

/** Human-ish thinking time in ms (docs/backend/07 §1.2 b). */
export function thinkMs(o: {
  rng: Rng;
  legalMoves: number;
  tactical: boolean;
  ply: number;
  clockSec?: number;
}): number {
  const lo = cfg.get<number>('think.minMs');
  const hi = cfg.get<number>('think.maxMs');
  const complexity = Math.min(1, o.legalMoves / 40) * 0.5 + (o.tactical ? 0.4 : 0);
  let t = lo + (hi - lo) * Math.min(1, 0.15 + complexity * 0.6 + o.rng() * 0.35);
  if (o.ply < cfg.get<number>('think.openingPlies')) t *= cfg.get<number>('think.openingFactor');
  if (o.clockSec !== undefined && o.clockSec > 0)
    t = Math.min(t, o.clockSec * 1000 * cfg.get<number>('think.clockFraction'));
  return Math.max(250, Math.round(t));
}

/** Resign only when clearly lost for several moves, from level 3 up (docs/backend/07 §1.2 c). `recentCp` newest last, bot POV. */
export function shouldResign(level: Level, recentCp: number[]): boolean {
  const n = cfg.get<number>('resign.consecutive');
  if (level.id < cfg.get<number>('resign.minLevel') || recentCp.length < n) return false;
  return recentCp.slice(-n).every((cp) => cp <= cfg.get<number>('resign.evalCp'));
}
export function acceptsDraw(cpBotPov: number, ply: number): boolean {
  return Math.abs(cpBotPov) <= cfg.get<number>('draw.maxAbsCp') && ply > cfg.get<number>('draw.minPly');
}
