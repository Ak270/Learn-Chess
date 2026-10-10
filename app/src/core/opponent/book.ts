import book from '../../content/book.json';
import type { Rng } from './sampler';

/** Weighted continuation from the tiny built-in book given the UCI move history so far; undefined when out of book. */
export function bookMove(history: string[], rng: Rng, maxPlies: number): string | undefined {
  if (history.length >= maxPlies) return undefined;
  const opts = book.lines.filter((l) => history.every((m, i) => l.moves[i] === m) && l.moves.length > history.length);
  if (!opts.length) return undefined;
  const total = opts.reduce((a, l) => a + l.w, 0);
  let r = rng() * total;
  for (const l of opts) {
    r -= l.w;
    if (r <= 0) return l.moves[history.length];
  }
  return opts[opts.length - 1].moves[history.length];
}
