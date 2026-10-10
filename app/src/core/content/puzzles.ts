// Puzzle shards (docs/backend/06 §2.3). Lichess format: FEN is BEFORE the opponent's move; moves[0] is the opponent's.
import { Chess } from 'chess.js';
import type { SkillId } from '../../types/ids';

export interface RawPuzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  /** generated drills: the FEN is already the learner's position (no opponent move first) */
  own?: boolean;
}
export interface PuzzleView {
  id: string;
  skill: SkillId;
  /** position the learner sees (after the opponent's first move) */
  fen: string;
  /** the opponent's move that was just played, for highlighting */
  lastMove: { from: string; to: string };
  /** learner moves and forced replies in order: even index = learner */
  line: string[];
  rating: number;
  themes: string[];
  turn: 'w' | 'b';
}

export function toPuzzleView(p: RawPuzzle, skill: SkillId): PuzzleView {
  const mv = p.moves.split(' ');
  if (p.own) {
    const c0 = new Chess(p.fen);
    return {
      id: p.id,
      skill,
      fen: p.fen,
      lastMove: { from: '', to: '' },
      line: mv,
      rating: p.rating,
      themes: p.themes,
      turn: c0.turn(),
    };
  }
  const c = new Chess(p.fen);
  c.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] });
  return {
    id: p.id,
    skill,
    fen: c.fen(),
    lastMove: { from: mv[0].slice(0, 2), to: mv[0].slice(2, 4) },
    line: mv.slice(1),
    rating: p.rating,
    themes: p.themes,
    turn: c.turn(),
  };
}

/** Checks a learner move against the line; mate-in-one puzzles accept any mate. */
export function checkPuzzleMove(v: PuzzleView, step: number, uci: string): 'correct' | 'wrong' | 'done' {
  const expected = v.line[step * 2];
  if (uci === expected) return step * 2 + 1 >= v.line.length ? 'done' : 'correct';
  // any checkmate also solves a mate puzzle on its last learner move
  const fenNow = v.line.slice(0, step * 2).reduce((c, m) => {
    c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    return c;
  }, new Chess(v.fen));
  try {
    fenNow.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (fenNow.isCheckmate() && step * 2 + 1 >= v.line.length) return 'done';
  } catch {
    /* illegal */
  }
  return 'wrong';
}

/** nearest-rating pick that avoids recently seen ids; deterministic ties via index */
export function pickNearest<T extends { id: string; rating: number }>(
  list: T[],
  target: number,
  seen: Set<string>,
): T | undefined {
  const pool = list.filter((p) => !seen.has(p.id));
  const src = pool.length ? pool : list;
  return [...src].sort(
    (a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target) || a.id.localeCompare(b.id),
  )[0];
}

/** Elo-like update; `k` from config (docs/backend/05 §5.4). */
export function eloUpdate(rating: number, puzzleRating: number, solved: boolean, k: number): number {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - rating) / 400));
  return rating + k * ((solved ? 1 : 0) - expected);
}

export const BANDS = ['400-700', '700-900', '900-1150', '1150-1400'] as const;
export const bandFor = (rating: number) =>
  BANDS.find((b) => {
    const [lo, hi] = b.split('-').map(Number);
    return rating >= lo && rating < hi;
  }) ?? (rating < 400 ? BANDS[0] : BANDS[BANDS.length - 1]);
